"""Hindi voice in and out (spec US-10): Amazon Transcribe for voice notes, Amazon Polly for replies.

In:  the voice note goes to s3://<bucket>/voice/in/<id>.<ext> (1-day lifecycle, deleted right after),
     a Transcribe batch job identifies Hindi (hi-IN) or Indian English (en-IN) and transcribes it.
     WhatsApp and Telegram voice notes are Ogg/Opus, which Transcribe accepts directly.
Out: the text reply (links and the data footer removed) is spoken by Polly's Hindi/Indian-English
     neural voice and sent back as an MP3 audio message, after the text reply.
Behind VOICE_ENABLED so the demo never depends on it.
"""
from __future__ import annotations

import re
import time

import httpx

from common.aws import client
from common.config import settings
from common.ids import new_ulid
from common.obs import logger

FORMATS = {"audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "mp4", "audio/amr": "amr",
           "audio/wav": "wav", "audio/webm": "webm"}
POLL_S = 1.5
MAX_WAIT_S = 45


def media_format(mime: str) -> str | None:
    return FORMATS.get((mime or "").split(";")[0].strip().lower())


def transcribe(audio: bytes, mime: str, *, transcribe_client=None, http_get=httpx.get, sleep=time.sleep) -> dict | None:
    """Returns {text, language} or None when the audio cannot be understood in time."""
    fmt = media_format(mime)
    if fmt is None:
        return None
    s3 = client("s3")
    tc = transcribe_client or client("transcribe")
    job = f"jaltaap-{new_ulid().lower()}"
    key = f"voice/in/{job}.{fmt}"
    bucket = settings().bucket
    s3.put_object(Bucket=bucket, Key=key, Body=audio, ContentType=mime)
    try:
        tc.start_transcription_job(TranscriptionJobName=job, Media={"MediaFileUri": f"s3://{bucket}/{key}"},
                                   MediaFormat=fmt, IdentifyLanguage=True, LanguageOptions=["hi-IN", "en-IN"])
        waited = 0.0
        while waited < MAX_WAIT_S:
            info = tc.get_transcription_job(TranscriptionJobName=job)["TranscriptionJob"]
            status = info["TranscriptionJobStatus"]
            if status == "COMPLETED":
                data = http_get(info["Transcript"]["TranscriptFileUri"], timeout=10.0)
                data.raise_for_status()
                text = " ".join(t["transcript"] for t in data.json()["results"]["transcripts"]).strip()
                return {"text": text, "language": info.get("LanguageCode", "hi-IN")} if text else None
            if status == "FAILED":
                logger.warning("transcription failed", extra={"reason": info.get("FailureReason")})
                return None
            sleep(POLL_S)
            waited += POLL_S
        logger.warning("transcription timed out")
        return None
    finally:
        try:
            s3.delete_object(Bucket=bucket, Key=key)
        except Exception:  # noqa: BLE001 - the 1-day lifecycle rule removes it anyway
            logger.exception("could not delete voice note")
        try:
            tc.delete_transcription_job(TranscriptionJobName=job)
        except Exception:  # noqa: BLE001
            pass


def speakable(reply: str) -> str:
    """Drop links and the 'Data: Open-Meteo, HH:MM IST' footer; Polly should not read URLs aloud."""
    text = re.sub(r"https?://\S+", "", reply)
    text = re.sub(r"Data: Open-Meteo, \d{2}:\d{2} IST", "", text)
    return re.sub(r"[ \t]+", " ", text).strip()[:1500]


def synthesize(reply: str, lang: str, *, polly_client=None) -> bytes | None:
    """MP3 of the reply in Polly's neural Indian voice (Hindi for hi/hinglish, Indian English for en)."""
    text = speakable(reply)
    if not text:
        return None
    pc = polly_client or client("polly")
    resp = pc.synthesize_speech(Text=text, OutputFormat="mp3", VoiceId=settings().polly_voice, Engine="neural",
                                LanguageCode="en-IN" if lang == "en" else "hi-IN")
    return resp["AudioStream"].read()


GLASSES_PER_HOUR = {"GREEN": 1, "YELLOW": 3, "ORANGE": 3, "RED": 4}   # = risk.yaml crew water / 250 ml


def summary_lines(summary: dict, lang: str) -> list[str]:
    """Fixed sentences for a /now summary, the same ones the web Listen button speaks.

    Built on the server so /speak cannot be used to speak arbitrary text.
    """
    from common import i18n
    lang = "hi" if lang in ("hi", "hinglish") else "en"
    t = lambda k, **kw: i18n.t(k, lang, **kw)   # noqa: E731
    band = (summary.get("now") or {}).get("band") or summary["today"]["day_band"]
    today = summary["today"]
    lines = [t(f"speak_verdict_{band}")]
    hour = lambda x: str(int(x[:2]) % 24)   # noqa: E731
    if today["heavy_work_windows"]:
        ranges = t("speak_and").join(t("speak_range", a=hour(w["from"]), b=hour(w["to"])) for w in today["heavy_work_windows"])
        lines.append(t("speak_heavy", ranges=ranges))
    elif today["day_band"] in ("ORANGE", "RED"):
        lines.append(t("speak_no_heavy"))
    if today.get("noon_pause"):
        lines.append(t("speak_noon"))
    n = GLASSES_PER_HOUR[band]
    lines.append(t("speak_water_one") if n == 1 else t("speak_water", n=n))
    air = summary.get("air") or {}
    if air.get("category") in ("POOR", "VERY_POOR", "SEVERE"):
        lines.append(t("speak_mask"))
    uv = summary.get("uv") or {}
    if uv.get("today_category") in ("HIGH", "VERY_HIGH", "EXTREME"):
        lines.append(t("speak_sun"))
    if ((summary.get("now") or {}).get("area_flood_level") or "LOW") in ("MEDIUM", "HIGH", "SEVERE", "CONFIRMED"):
        lines.append(t("speak_rain"))
    if band in ("ORANGE", "RED"):
        lines.append(t("speak_emergency"))
    return lines
