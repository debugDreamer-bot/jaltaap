"""AlertSenderFn: AlertQueue → WhatsApp, Telegram or email, at most once per hazard per area per 6 hours.

Alerts and briefs are fixed templates (no LLM), rendered in the subscriber's language.
WhatsApp free-form text only reaches users who messaged in the last 24 hours; outside that window
the send fails and is logged (an approved template is the production path, see DECISIONS.md).
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta

from common import channels, dynamo, i18n
from common.ids import now_ist
from common.obs import MetricUnit, logger, metrics, tracer

DEDUPE = timedelta(hours=6)


def _windows_text(windows: list[dict], lang: str) -> str:
    if not windows:
        return {"en": "today", "hi": "आज", "hinglish": "aaj"}[lang]
    joined = ", ".join(f"{w['from']}–{w['to']}" for w in windows)
    return {"en": f"between {joined}", "hi": f"{joined} के बीच", "hinglish": f"{joined} ke beech"}[lang]


def render(msg: dict, lang: str) -> str:
    p = msg["params"]
    footer = i18n.footer(p["updated_at"], lang)
    if msg["template_key"] == "alert_heat":
        area = p.get("area_label") or {"en": "your area", "hi": "आपके इलाके", "hinglish": "Aapke ilaake"}[lang]
        return i18n.t("alert_heat", lang, area=area, band=i18n.band_word(p["band"], lang),
                      avoid=_windows_text(p.get("avoid_windows", []), lang), footer=footer)
    if msg["template_key"] == "alert_flood":
        return i18n.t("alert_flood", lang, spot=p["spot"], level=i18n.level_word(p["level"], lang),
                      agency=p["agency"], footer=footer)
    if msg["template_key"] == "brief_heat":
        return i18n.t("brief_heat", lang, band=i18n.band_word(p["band"], lang),
                      windows=_windows_text(p.get("heavy_work_windows", []), lang), footer=footer)
    raise ValueError(f"unknown template {msg['template_key']}")


def deliver(msg: dict) -> str:
    pk, sk = f"area#{msg['area']}", f"user#{msg['user_hash']}#{msg['hazard']}"
    sub = dynamo.get_subscription(pk, sk)
    if not sub:
        return "unsubscribed"
    is_brief = msg["template_key"] == "brief_heat"
    stamp_field = "last_brief_at" if is_brief else "last_alert_at"
    last = sub.get(stamp_field)
    window = timedelta(hours=20) if is_brief else DEDUPE
    if last and datetime.fromisoformat(last) > now_ist() - window:
        return "deduped"
    user = dynamo.get_user(msg["user_hash"])
    if not user:
        return "no user"
    channels.send(user["channel"], user["channel_id"], render(msg, user.get("lang", "hi")))
    dynamo.mark_alerted(pk, sk, now_ist().isoformat(timespec="seconds"), field=stamp_field)
    return "sent"


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    sent = 0
    for record in event.get("Records", []):
        msg = json.loads(record["body"])
        try:
            outcome = deliver(msg)
        except Exception:  # noqa: BLE001 - e.g. WhatsApp 24-hour window; log and move on
            logger.exception("alert delivery failed", extra={"hazard": msg.get("hazard"), "area": msg.get("area")})
            continue
        sent += outcome == "sent"
    if sent:
        metrics.add_metric(name="AlertsSent", unit=MetricUnit.Count, value=sent)
    return {"sent": sent}
