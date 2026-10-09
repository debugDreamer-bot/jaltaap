"""PublicApiFn: read-only data for the web app, plus the presigned photo upload for web reports."""
from __future__ import annotations

import json
import re

from common.geo import geohash, geohash_decode
from pydantic import ValidationError

from common import dynamo, refdata
from common.aws import client
from common.config import VERSION, settings
from common.http import error, json_body, query, respond, source_ip
from common.ids import hour_iso, iso, new_ulid, now_ist, user_hash
from common.models import UploadUrlRequest
from common.obs import logger, metrics, tracer
from risk import grid as gridmod
from risk import service

SCENARIO = re.compile(r"^(heat|flood|humid-heat)-\d{4}-\d{2}-\d{2}$")
PUBLIC_REPORT_FIELDS = ("lat", "lon", "status", "agency", "hotspot_id", "created_at")


def _presign_get(key: str) -> str:
    return client("s3").generate_presigned_url("get_object", Params={"Bucket": settings().bucket, "Key": key},
                                               ExpiresIn=900)


def _hour_param(event) -> str:
    t = query(event).get("time")
    if not t:
        return hour_iso(now_ist())
    from datetime import datetime
    try:
        return hour_iso(datetime.fromisoformat(t.replace(" ", "+")))
    except ValueError as err:
        raise ValueError("time must be ISO 8601") from err


def risk_heat(event) -> dict:
    hour = _hour_param(event)
    meta = dynamo.get_risk_item("meta#heat", "latest") or {}
    cells = gridmod.cells()
    rows = {r["pk"].split("#", 1)[1]: r for r in dynamo.batch_get_risk([(f"heat#{c['id']}", hour) for c in cells])}
    updated = meta.get("data_updated_at")
    if len(rows) < len(cells) and hour == hour_iso(now_ist()):
        # cache not filled yet (first deploy): compute this hour live from the same engine
        series = service.grid_series()
        for c in cells:
            hrs = service.heat_hours(series[c["id"]], now_ist(), 1)
            if hrs:
                rows[c["id"]] = hrs[0]
        updated = next(iter(series.values()))["fetched_at"]
    if not rows:
        return error(404, "no data for that hour")
    return respond(200, {
        "time": hour, "source": "open-meteo", "data_updated_at": updated,
        "hours_available": meta.get("hours_available", [hour]),
        "cells": [{**c, **{k: rows[c["id"]][k] for k in ("band", "temp_c", "rh", "wet_bulb_c")}}
                  for c in cells if c["id"] in rows],
    }, cache_s=300)


def risk_flood(event) -> dict:
    hour = _hour_param(event)
    spots = refdata.hotspots()
    meta = dynamo.get_risk_item("meta#flood", "latest") or {}
    rows = {r["pk"].split("#", 1)[1]: r for r in dynamo.batch_get_risk([(f"flood#{s['id']}", hour) for s in spots])}
    updated = meta.get("data_updated_at")
    if len(rows) < len(spots) and hour == hour_iso(now_ist()):
        live, updated = service.flood_now_for_spots(spots)
        rows = {r["id"]: r for r in live}
    out = []
    for s in spots:
        r = rows.get(s["id"])
        if r:
            out.append({k: s[k] for k in ("id", "name", "type", "agency", "lat", "lon")} |
                       {k: r.get(k) for k in ("level", "risk", "rain_next_1h_mm", "rain_next_3h_mm", "confirmed_reports")})
    return respond(200, {"time": hour, "horizon_h": 3, "source": "open-meteo", "data_updated_at": updated,
                         "hotspots": out}, cache_s=300)


def relief(_event) -> dict:
    return respond(200, {"points": [{k: p.get(k) for k in ("id", "name", "kind", "status", "lat", "lon", "cool_room", "source")}
                                    for p in refdata.relief_points()]}, cache_s=3600)


def public_reports(event) -> dict:
    q = query(event)
    status = q.get("status", "verified")
    if status not in ("verified", "confirmed"):
        return error(400, "status must be verified or confirmed")
    since = q.get("since") or dynamo.since(6)
    items = dynamo.reports_by_status(status, since)
    out = []
    for r in items:
        v = r.get("verdict") or {}
        out.append({"id": r["report_id"], **{k: r.get(k) for k in PUBLIC_REPORT_FIELDS},
                    "thumb_url": _presign_get(r["thumb_key"]) if r.get("thumb_key") else None,
                    "hazard_type": v.get("hazard_type"), "water_depth": v.get("water_depth"),
                    "severity": v.get("severity"), "summary_en": v.get("summary_en"), "summary_hi": v.get("summary_hi")})
    return respond(200, {"reports": out})


def replay_index(_event) -> dict:
    try:
        body = client("s3").get_object(Bucket=settings().bucket, Key="replays/index.json")["Body"].read()
        return respond(200, json.loads(body), cache_s=3600)
    except Exception:  # noqa: BLE001
        return respond(200, {"scenarios": []})


def replay(event, scenario: str) -> dict:
    if not SCENARIO.match(scenario):
        return error(404, "unknown scenario")
    try:
        body = client("s3").get_object(Bucket=settings().bucket, Key=f"replays/{scenario}.json")["Body"].read()
    except Exception:  # noqa: BLE001
        return error(404, "replay not found")
    return {"statusCode": 200, "headers": {"Content-Type": "application/json", "Cache-Control": "public, max-age=86400"},
            "body": body.decode("utf-8")}


def upload_url(event) -> dict:
    try:
        req = UploadUrlRequest.model_validate(json_body(event))
    except (ValueError, ValidationError):
        return error(400, "send {session_id, lat, lon, note?}")
    if not gridmod.in_delhi(req.lat, req.lon):
        return error(400, "location is outside Delhi")
    uh = user_hash("web", req.session_id)
    if not dynamo.rate_limit(f"reports#{uh}", 10, 3600) or not dynamo.rate_limit(f"upload#ip#{source_ip(event)}", 30, 3600):
        return error(429, "too many reports in the last hour")
    rid = new_ulid()
    d = now_ist()
    key = f"reports/raw/{d:%Y}/{d:%m}/{d:%d}/{rid}.jpg"
    dynamo.put_report({"pk": f"report#{rid}", "report_id": rid, "user_hash": uh, "channel": "web", "s3_key": key,
                       "lat": req.lat, "lon": req.lon, "geohash7": geohash(req.lat, req.lon, 7),
                       "geohash5": geohash(req.lat, req.lon, 5), "status": "pending",
                       "note": (req.note or "")[:280], "created_at": iso(d)})
    url = client("s3").generate_presigned_url(
        "put_object", Params={"Bucket": settings().bucket, "Key": key, "ContentType": "image/jpeg"}, ExpiresIn=900)
    return respond(200, {"report_id": rid, "upload_url": url, "content_type": "image/jpeg", "expires_in": 900})


def report_status(_event, report_id: str) -> dict:
    r = dynamo.get_report(report_id)
    if not r or r.get("channel") != "web":
        return error(404, "not found")
    v = r.get("verdict")
    return respond(200, {"status": r["status"], "agency": r.get("agency"),
                         "verdict": {k: v.get(k) for k in ("relevant", "hazard_type", "water_depth", "severity",
                                                           "summary_en", "summary_hi")} if v else None})


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    route = event.get("routeKey", "")
    params = event.get("pathParameters") or {}
    try:
        if route == "GET /health":
            return respond(200, {"status": "ok", "version": VERSION, "time": iso(now_ist())})
        if route == "GET /risk/heat":
            return risk_heat(event)
        if route == "GET /risk/flood":
            return risk_flood(event)
        if route == "GET /relief":
            return relief(event)
        if route == "GET /reports":
            return public_reports(event)
        if route == "GET /replay":
            return replay_index(event)
        if route == "GET /replay/{scenario}":
            return replay(event, params.get("scenario", ""))
        if route == "POST /reports/upload-url":
            return upload_url(event)
        if route == "GET /reports/{id}/status":
            return report_status(event, params.get("id", ""))
    except ValueError as err:
        return error(400, str(err))
    return error(404, "not found")
