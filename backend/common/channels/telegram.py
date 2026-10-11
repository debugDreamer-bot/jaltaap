"""Telegram Bot API (development and fallback channel). Docs: https://core.telegram.org/bots/api"""
from __future__ import annotations

import hmac

import httpx

from common.models import InboundMessage
from common.secrets import get_secret

TIMEOUT = httpx.Timeout(10.0, connect=3.0)


def verify_secret(header: str | None, expected: str) -> bool:
    """X-Telegram-Bot-Api-Secret-Token must match the secret set with setWebhook."""
    return bool(header) and hmac.compare_digest(header, expected)


def parse_update(update: dict) -> list[InboundMessage]:
    msg = update.get("message") or update.get("edited_message")
    if not msg:
        return []
    chat_id = str(msg.get("chat", {}).get("id", ""))
    base = dict(channel="telegram", channel_user_id=chat_id, message_id=str(update.get("update_id", msg.get("message_id"))),
                timestamp=msg.get("date"))
    if not chat_id:
        return []
    if "message" not in update and "location" not in msg:
        return []   # edits matter only as live-location moves; an edited text is not a new question
    if "location" in msg:
        loc = msg["location"]
        # live location: the first pin has live_period; each move arrives as an edited_message
        edited = "message" not in update
        live = "update" if edited else ("start" if loc.get("live_period") else None)
        return [InboundMessage(**base, type="location", lat=loc.get("latitude"), lon=loc.get("longitude"), live=live)]
    if "photo" in msg:
        largest = max(msg["photo"], key=lambda p: p.get("file_size", 0) or p.get("width", 0))
        return [InboundMessage(**base, type="image", media_id=largest.get("file_id"), caption=msg.get("caption"))]
    if "voice" in msg or "audio" in msg:
        return [InboundMessage(**base, type="audio", media_id=(msg.get("voice") or msg.get("audio")).get("file_id"))]
    if "text" in msg:
        return [InboundMessage(**base, type="text", text=msg["text"])]
    return [InboundMessage(**base, type="unknown")]


def _api(method: str) -> str:
    return f"https://api.telegram.org/bot{get_secret('telegram/bot_token')}/{method}"


LOCATION_KEYBOARD = {
    "keyboard": [[{"text": "📍 Share location / लोकेशन भेजें", "request_location": True}],
                 [{"text": "Heat plan"}, {"text": "Flood check"}]],
    "resize_keyboard": True,
}


def send_message(chat_id: str, text: str, with_keyboard: bool = True) -> dict:
    payload = {"chat_id": chat_id, "text": text[:4096], "disable_web_page_preview": True}
    if with_keyboard:
        payload["reply_markup"] = LOCATION_KEYBOARD
    r = httpx.post(_api("sendMessage"), json=payload, timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def download_file(file_id: str, max_bytes: int = 10 * 1024 * 1024) -> tuple[bytes, str]:
    meta = httpx.get(_api("getFile"), params={"file_id": file_id}, timeout=TIMEOUT)
    meta.raise_for_status()
    result = meta.json()["result"]
    if int(result.get("file_size", 0) or 0) > max_bytes:
        raise ValueError("media too large")
    url = f"https://api.telegram.org/file/bot{get_secret('telegram/bot_token')}/{result['file_path']}"
    data = httpx.get(url, timeout=httpx.Timeout(20.0, connect=3.0))
    data.raise_for_status()
    ext = result["file_path"].rsplit(".", 1)[-1].lower()
    mime = {"oga": "audio/ogg", "ogg": "audio/ogg", "opus": "audio/ogg", "mp3": "audio/mpeg", "m4a": "audio/mp4",
            "wav": "audio/wav", "png": "image/png"}.get(ext, "image/jpeg")
    return data.content, mime


def send_audio(chat_id: str, mp3: bytes) -> dict:
    """Send an MP3 (Amazon Polly) as a Telegram audio message."""
    r = httpx.post(_api("sendAudio"), data={"chat_id": chat_id, "title": "JalTaap"},
                   files={"audio": ("jaltaap.mp3", mp3, "audio/mpeg")}, timeout=httpx.Timeout(20.0, connect=3.0))
    r.raise_for_status()
    return r.json()
