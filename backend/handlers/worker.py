"""AgentWorkerFn: one inbound message per SQS record (batch size 1).

No LLM sits in the STOP, consent, location-pin or photo paths; only text goes to the agent.
"""
from __future__ import annotations

import json

from common.geo import geohash, geohash_decode

from agent.session import answer, location_from_user
from common import channels, dynamo, i18n, live_location
from common.aws import client
from common.config import settings
from common.ids import new_ulid, now_ist, user_hash
from common.models import InboundMessage
from common.obs import MetricUnit, logger, metrics, tracer
from risk.grid import in_india

STOP_WORDS = {"STOP", "STOP ALL", "UNSUBSCRIBE", "रोकें", "बंद करो", "BAND KARO"}
REPORTS_PER_HOUR = 10


def _send(msg: InboundMessage, text: str) -> None:
    channels.send(msg.channel, msg.channel_user_id, text)
    metrics.add_metric(name="RepliesOut", unit=MetricUnit.Count, value=1)


MENU = {"en": ("What do you need?", ["Heat plan", "Flood check", "Report"]),
        "hi": ("आपको क्या चाहिए?", ["गर्मी प्लान", "जलभराव जाँच", "रिपोर्ट"]),
        "hinglish": ("Aapko kya chahiye?", ["Heat plan", "Flood check", "Report"])}


def _send_menu(msg: InboundMessage, lang: str) -> None:
    """Three WhatsApp reply buttons; a tap comes back as an interactive message with the title."""
    from common.channels import whatsapp
    body, titles = MENU.get(lang, MENU["en"])
    try:
        whatsapp.send_buttons(msg.channel_user_id, body, list(zip(("heat", "flood", "report"), titles)))
    except Exception:  # noqa: BLE001 - buttons are a convenience; never fail the turn
        logger.exception("could not send menu buttons")


def _raw_key(report_id: str) -> str:
    d = now_ist()
    return f"reports/raw/{d:%Y}/{d:%m}/{d:%d}/{report_id}.jpg"


def _start_report(uh: str, msg: InboundMessage, image: bytes, lat: float, lon: float) -> str:
    """Write the original to reports/raw/ (which triggers VerifierFn) and create a pending report."""
    rid = new_ulid()
    key = _raw_key(rid)
    dynamo.put_report({
        "pk": f"report#{rid}", "report_id": rid, "user_hash": uh, "channel": msg.channel, "s3_key": key,
        "lat": lat, "lon": lon, "geohash7": geohash(lat, lon, 7), "geohash6": geohash(lat, lon, 6),
        "geohash5": geohash(lat, lon, 5),
        "status": "pending", "note": (msg.caption or "")[:280], "created_at": now_ist().isoformat(timespec="seconds"),
    })
    client("s3").put_object(Bucket=settings().bucket, Key=key, Body=image, ContentType="image/jpeg",
                            Metadata={"report_id": rid})
    return rid


def _download(msg: InboundMessage) -> bytes:
    return _download_with_type(msg)[0]


def _download_with_type(msg: InboundMessage) -> tuple[bytes, str]:
    if msg.channel == "whatsapp":
        from common.channels import whatsapp
        return whatsapp.download_media(msg.media_id)
    from common.channels import telegram
    return telegram.download_file(msg.media_id)


def _voice_turn(msg: InboundMessage, uh: str, user: dict) -> None:
    """Voice note → Amazon Transcribe → agent → text reply plus an Amazon Polly audio reply."""
    from common import voice
    lang = user.get("lang", "hi")
    audio, mime = _download_with_type(msg)
    heard = voice.transcribe(audio, mime)
    if not heard:
        _send(msg, i18n.t("voice_unclear", lang))
        return
    text = heard["text"]
    lang = i18n.detect_language(text)
    if lang == "en" and heard["language"].startswith("hi"):
        lang = "hinglish"   # Hindi speech transcribed in Roman script
    metrics.add_metric(name="VoiceNotesIn", unit=MetricUnit.Count, value=1)
    if text.upper() in STOP_WORDS or text in STOP_WORDS:
        dynamo.delete_everything(uh)
        _send(msg, i18n.t("stop_done", lang))
        return
    out = answer(user_hash=uh, channel=msg.channel, lang=lang, text=text,
                 last_location=location_from_user(user), profile=user.get("profile"))
    _send(msg, i18n.t("voice_heard", lang, text=text[:200]) + "\n" + out["reply"])
    try:
        mp3 = voice.synthesize(out["reply"], lang)
        if mp3:
            channels.send_audio(msg.channel, msg.channel_user_id, mp3)
    except Exception:  # noqa: BLE001 - the text reply already went out
        logger.exception("voice reply failed")


def _live_update(msg: InboundMessage, uh: str, user: dict, lang: str, baseline: bool = False) -> None:
    try:
        text, fields = live_location.check(user, msg.lat, msg.lon, lang, baseline=baseline)
    except Exception:  # noqa: BLE001 - a missed check is retried on the next move; never fail the turn
        logger.exception("live location check failed")
        return
    if text:
        _send(msg, text)
        metrics.add_metric(name="LiveWarningsOut", unit=MetricUnit.Count, value=1)
    dynamo.update_user(uh, **fields)


@tracer.capture_method
def process(msg: InboundMessage) -> None:
    uh = user_hash(msg.channel, msg.channel_user_id)
    logger.append_keys(user_hash=uh[:16], message_id=msg.message_id)
    user = dynamo.get_user(uh)
    text = (msg.text or "").strip()
    lang = i18n.detect_language(text) if text else (user or {}).get("lang", "hi")

    if text.upper() in STOP_WORDS or text in STOP_WORDS:
        dynamo.delete_everything(uh)
        _send(msg, i18n.t("stop_done", (user or {}).get("lang", lang)))
        return

    if user is None:
        user = dynamo.put_user(uh, channel=msg.channel, channel_id=msg.channel_user_id, lang=lang)
        _send(msg, i18n.t("consent", lang))
        if msg.channel == "whatsapp":
            _send_menu(msg, lang)
    elif text and user.get("lang") != lang:
        dynamo.update_user(uh, lang=lang)

    if msg.type == "location" and msg.lat is not None and msg.lon is not None:
        if msg.live == "update":   # a move while sharing live location: no LLM, warn only on change
            if in_india(msg.lat, msg.lon):
                _live_update(msg, uh, user, lang)
            return
        if not in_india(msg.lat, msg.lon):
            _send(msg, i18n.t("outside_india", lang))
            return
        dynamo.update_user(uh, last_geohash6=geohash(msg.lat, msg.lon, 6),
                           last_location_at=now_ist().isoformat(timespec="seconds"), last_location_label=msg.text or "")
        pending = user.get("pending_photo_key")
        if pending:
            image = client("s3").get_object(Bucket=settings().bucket, Key=pending)["Body"].read()
            _start_report(uh, msg, image, msg.lat, msg.lon)
            client("s3").delete_object(Bucket=settings().bucket, Key=pending)
            dynamo.update_user(uh, pending_photo_key="")
            _send(msg, i18n.t("photo_received", lang))
            return
        loc = {"lat": msg.lat, "lon": msg.lon, "label": msg.text}
        out = answer(user_hash=uh, channel=msg.channel, lang=lang, last_location=loc, profile=user.get("profile"),
                     text=msg.text or "(The user shared a location pin. Answer their last question for this place, "
                                      "or give today's heat plan here.)")
        if msg.live == "start":
            _send(msg, out["reply"] + "\n\n" + i18n.t("live_started", lang))
            _live_update(msg, uh, user, lang, baseline=True)
        else:
            _send(msg, out["reply"])
        return

    if msg.type == "image" and msg.media_id:
        if not dynamo.rate_limit(f"reports#{uh}", REPORTS_PER_HOUR, 3600):
            _send(msg, i18n.t("photo_rejected", lang, reason=i18n.t("reason_rate", lang)))
            return
        image = _download(msg)
        loc = location_from_user(user)
        if loc is None:
            hold = f"reports/hold/{uh[:16]}.jpg"   # waits for a location pin, then moves to reports/raw/
            client("s3").put_object(Bucket=settings().bucket, Key=hold, Body=image, ContentType="image/jpeg")
            dynamo.update_user(uh, pending_photo_key=hold)
            _send(msg, i18n.t("photo_need_location", lang))
            return
        _start_report(uh, msg, image, loc["lat"], loc["lon"])
        _send(msg, i18n.t("photo_received", lang))
        return

    if msg.type == "audio":
        if not settings().voice_enabled or not msg.media_id:
            _send(msg, i18n.t("voice_not_supported", lang))
            return
        _voice_turn(msg, uh, user)
        return

    if not text:
        _send(msg, i18n.t("ask_location", lang))
        return

    if msg.type == "interactive" and text in ("Report", "रिपोर्ट"):
        _send(msg, i18n.t("ask_photo", lang))
        return

    out = answer(user_hash=uh, channel=msg.channel, lang=lang, text=text,
                 last_location=location_from_user(user), profile=user.get("profile"))
    _send(msg, out["reply"])


@metrics.log_metrics
@logger.inject_lambda_context(clear_state=True)
@tracer.capture_lambda_handler
def handler(event, context):
    for record in event.get("Records", []):
        msg = InboundMessage.model_validate(json.loads(record["body"]))
        process(msg)   # exceptions propagate so SQS retries, then the DLQ after three receives
    return {"ok": True}
