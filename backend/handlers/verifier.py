"""VerifierFn: S3 ObjectCreated under reports/raw/ → Bedrock vision verdict → report status.

Only reports with relevant=true and confidence >= 0.7 change the map. Officers can overrule any
verdict. The model never sees phone numbers or user ids.
"""
from __future__ import annotations

import json
import urllib.parse

from common import channels, dynamo, i18n, photo, refdata, vision
from common.aws import client
from common.config import settings
from common.geo import haversine_m
from common.ids import now_ist
from common.obs import MetricUnit, logger, metrics, tracer
from risk.config_loader import flood_config
from risk.flood import level_index
from risk.grid import in_delhi

MIN_CONFIDENCE = 0.7
MATCH_RADIUS_M = 300
CORROBORATION_BONUS = 0.1


def nearest_hotspot(lat: float, lon: float) -> dict | None:
    best = min(refdata.hotspots(), key=lambda h: haversine_m(lat, lon, h["lat"], h["lon"]), default=None)
    if best and haversine_m(lat, lon, best["lat"], best["lon"]) <= MATCH_RADIUS_M:
        return best
    return None


def corroborated(report: dict) -> bool:
    """Another user's verified report within 300 m in the last 2 hours."""
    window = flood_config()["crowd"]["confirm_window_h"]
    for other in dynamo.reports_in_area(report["geohash5"], dynamo.since(window)):
        if other["report_id"] == report["report_id"] or other.get("user_hash") == report.get("user_hash"):
            continue
        if other.get("status") in ("verified", "confirmed") and \
                haversine_m(report["lat"], report["lon"], other["lat"], other["lon"]) <= MATCH_RADIUS_M:
            return True
    return False


def reporter_trust(report: dict) -> float:
    """1.0 by default; officers marking a reporter's photos false lowers it (min 0)."""
    if report.get("channel") == "web" or not report.get("user_hash"):
        return 1.0
    user = dynamo.get_user(report["user_hash"]) or {}
    return max(0.0, min(1.0, float(user.get("trust", 1.0))))


def decide(verdict, report: dict) -> tuple[str, float]:
    """Pure decision: (status, confidence) from a verdict, after corroboration."""
    if verdict is None:
        return "needs_review", 0.0
    conf = verdict.confidence * reporter_trust(report)
    if verdict.relevant and corroborated(report):
        conf = min(1.0, conf + CORROBORATION_BONUS)
    if verdict.relevant and conf >= MIN_CONFIDENCE:
        return "verified", round(conf, 2)
    return "needs_review" if verdict.relevant else "rejected", round(conf, 2)


def _notify(report: dict, key: str, **params) -> None:
    if report.get("channel") not in ("whatsapp", "telegram"):
        return   # web uploads poll /reports/{id}/status instead
    user = dynamo.get_user(report["user_hash"])
    if user:
        lang = user.get("lang", "hi")
        if "reason_key" in params:
            params = {"reason": i18n.t(params.pop("reason_key"), lang)}
        if "summary" in params and isinstance(params["summary"], dict):
            params["summary"] = params["summary"]["hi" if lang == "hi" else "en"]
        channels.send(user["channel"], user["channel_id"], i18n.t(key, lang, **params))


def _mark_hotspot_confirmed(spot_id: str) -> None:
    item = dynamo.get_risk_item(f"flood#{spot_id}", "latest")
    if item:
        item["level"] = "CONFIRMED"
        item["confirmed_reports"] = int(item.get("confirmed_reports", 0)) + 1
        item["computed_at"] = now_ist().isoformat(timespec="seconds")
        dynamo.put_risk_items([item])


def _alert_nearby(report: dict, spot: dict | None, level: str) -> None:
    if level_index(level) < level_index("SEVERE"):
        return
    sqs = client("sqs")
    for sub in dynamo.all_subscriptions():
        if sub["hazard"] == "flood" and sub["area"] == report["geohash5"] and sub["user"] != f"user#{report['user_hash']}":
            sqs.send_message(QueueUrl=settings().alert_queue_url, MessageBody=json.dumps({
                "user_hash": sub["user"].split("#", 1)[1], "hazard": "flood", "area": sub["area"],
                "template_key": "alert_flood",
                "params": {"spot": spot["name"] if spot else "a reported spot", "level": level,
                           "agency": report.get("agency", "MCD"), "updated_at": now_ist().isoformat(timespec="seconds")}}))


def _email_officers(report: dict) -> None:
    """Optional: /jaltaap/officer_emails holds {"PWD": ["a@example.org"]}. SES sandbox needs verified addresses."""
    try:
        from common.secrets import get_secret
        emails = json.loads(get_secret("officer_emails")).get(report.get("agency", ""), [])
    except Exception:  # noqa: BLE001 - not configured
        return
    for addr in emails:
        try:
            channels.send_email(addr, f"JalTaap verified report for {report['agency']}",
                                f"{report.get('verdict', {}).get('summary_en', '')}\n"
                                f"Location: https://www.google.com/maps?q={report['lat']},{report['lon']}\n"
                                f"Report id: {report['report_id']}")
        except Exception:  # noqa: BLE001
            logger.exception("officer email failed")


@tracer.capture_method
def verify(bucket: str, key: str, bedrock=None) -> dict:
    report_id = key.rsplit("/", 1)[-1].removesuffix(".jpg")
    report = dynamo.get_report(report_id)
    if not report or report.get("status") != "pending":
        return {"skipped": True}
    s3 = client("s3")
    img = photo.open_image(s3.get_object(Bucket=bucket, Key=key)["Body"].read())
    now = now_ist()

    def reject(reason_key: str):
        dynamo.update_report(report_id, status="rejected", reject_reason=reason_key.removeprefix("reason_"))
        _notify(report, "photo_rejected", reason_key=reason_key)
        return {"status": "rejected", "reason": reason_key}

    if not in_delhi(report["lat"], report["lon"]):
        return reject("reason_outside")
    if photo.too_old(img, now):
        return reject("reason_old")
    h = photo.phash(img)
    recent = dynamo.reports_in_area(report["geohash5"], dynamo.since(24 * 7))
    if photo.is_duplicate(h, [r.get("phash", "") for r in recent if r["report_id"] != report_id]):
        return reject("reason_duplicate")

    spot = nearest_hotspot(report["lat"], report["lon"])
    context_text = (f"Claimed location: {report['lat']:.5f}, {report['lon']:.5f}"
                    + (f" (near {spot['name']})" if spot else "") +
                    f". Time: {report['created_at']}. User note: {report.get('note') or 'none'}")
    v = vision.verdict(photo.for_model(img), context_text, bedrock)
    status, conf = decide(v, report)
    thumb_key = f"reports/thumb/{report_id}.jpg"
    s3.put_object(Bucket=bucket, Key=thumb_key, Body=photo.thumbnail(img), ContentType="image/jpeg")
    agency = spot["agency"] if spot and spot.get("agency") not in (None, "UNKNOWN") else "MCD"
    fields = {"status": status, "confidence": conf, "phash": h, "thumb_key": thumb_key, "agency": agency,
              "hotspot_id": spot["id"] if spot else "", "verified_at": now.isoformat(timespec="seconds")}
    if v is not None:
        fields["verdict"] = v.model_dump()
    updated = dynamo.update_report(report_id, **fields)

    if status == "verified":
        metrics.add_metric(name="ReportsVerified", unit=MetricUnit.Count, value=1)
        if spot:
            _mark_hotspot_confirmed(spot["id"])
        _notify(report, "photo_verified", summary={"en": v.summary_en, "hi": v.summary_hi}, agency=agency)
        _alert_nearby(updated, spot, "CONFIRMED" if spot else ("SEVERE" if v.severity >= 4 else "HIGH"))
        _email_officers(updated)
    else:
        metrics.add_metric(name="ReportsNeedsReview", unit=MetricUnit.Count, value=1)
        _notify(report, "photo_unclear")
    return {"status": status, "confidence": conf}


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    out = []
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])
        if key.startswith("reports/raw/"):
            out.append(verify(bucket, key))
    return {"results": out}
