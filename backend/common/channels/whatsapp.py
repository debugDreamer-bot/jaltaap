"""WhatsApp Cloud API: webhook verification, inbound parsing, sending and media download.

Docs: https://developers.facebook.com/docs/whatsapp/cloud-api
Free-form replies work only within 24 hours of the user's last message; proactive alerts
outside that window need an approved template (see DECISIONS.md).
"""
from __future__ import annotations

import hashlib
import hmac

import httpx

from common.config import settings
from common.models import InboundMessage
from common.secrets import get_secret

TIMEOUT = httpx.Timeout(10.0, connect=3.0)


def verify_signature(raw_body: bytes, header: str | None, app_secret: str) -> bool:
    """X-Hub-Signature-256 must equal 'sha256=' + HMAC-SHA256(raw body, app secret)."""
    if not header or not header.startswith("sha256="):
        return False
    expected = "sha256=" + hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header)


def verify_handshake(params: dict, verify_token: str) -> str | None:
    """GET handshake: return hub.challenge when mode is subscribe and the token matches."""
    if params.get("hub.mode") == "subscribe" and params.get("hub.verify_token") == verify_token:
        return params.get("hub.challenge", "")
    return None


def parse_inbound(payload: dict) -> list[InboundMessage]:
    """Messages sit at entry[].changes[].value.messages[]. Status callbacks are ignored."""
    out: list[InboundMessage] = []
    for entry in payload.get("entry", []) or []:
        for change in entry.get("changes", []) or []:
            value = change.get("value", {}) or {}
            for m in value.get("messages", []) or []:
                mtype = m.get("type", "unknown")
                base = dict(channel="whatsapp", channel_user_id=str(m.get("from", "")), message_id=str(m.get("id", "")),
                            timestamp=int(m["timestamp"]) if str(m.get("timestamp", "")).isdigit() else None)
                if mtype == "text":
                    out.append(InboundMessage(**base, type="text", text=m.get("text", {}).get("body", "")))
                elif mtype == "location":
                    loc = m.get("location", {})
                    out.append(InboundMessage(**base, type="location", lat=loc.get("latitude"), lon=loc.get("longitude"),
                                              text=loc.get("name") or loc.get("address")))
                elif mtype == "image":
                    img = m.get("image", {})
                    out.append(InboundMessage(**base, type="image", media_id=img.get("id"), caption=img.get("caption")))
                elif mtype == "audio":
                    out.append(InboundMessage(**base, type="audio", media_id=m.get("audio", {}).get("id")))
                elif mtype == "interactive":
                    inter = m.get("interactive", {})
                    reply = inter.get("button_reply") or inter.get("list_reply") or {}
                    out.append(InboundMessage(**base, type="interactive", text=reply.get("title") or reply.get("id")))
                else:
                    out.append(InboundMessage(**base, type="unknown"))
    return [m for m in out if m.channel_user_id and m.message_id]


def _graph(path: str) -> str:
    return f"https://graph.facebook.com/{settings().whatsapp_graph_version}/{path}"


def _headers() -> dict:
    return {"Authorization": f"Bearer {get_secret('whatsapp/token')}"}


def send_text(to: str, body: str) -> dict:
    phone_id = get_secret("whatsapp/phone_number_id")
    payload = {"messaging_product": "whatsapp", "to": to, "type": "text", "text": {"body": body[:4096]}}
    r = httpx.post(_graph(f"{phone_id}/messages"), json=payload, headers=_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def send_buttons(to: str, body: str, buttons: list[tuple[str, str]]) -> dict:
    """Interactive message with up to three reply buttons: [(id, title)]."""
    phone_id = get_secret("whatsapp/phone_number_id")
    payload = {
        "messaging_product": "whatsapp", "to": to, "type": "interactive",
        "interactive": {"type": "button", "body": {"text": body[:1024]},
                        "action": {"buttons": [{"type": "reply", "reply": {"id": i, "title": t[:20]}}
                                               for i, t in buttons[:3]]}},
    }
    r = httpx.post(_graph(f"{phone_id}/messages"), json=payload, headers=_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()


def download_media(media_id: str, max_bytes: int = 10 * 1024 * 1024) -> tuple[bytes, str]:
    """GET /<MEDIA_ID> gives a url; fetch it with the same bearer token. Returns (bytes, mime)."""
    meta = httpx.get(_graph(media_id), headers=_headers(), timeout=TIMEOUT)
    meta.raise_for_status()
    info = meta.json()
    if int(info.get("file_size", 0) or 0) > max_bytes:
        raise ValueError("media too large")
    data = httpx.get(info["url"], headers=_headers(), timeout=httpx.Timeout(20.0, connect=3.0))
    data.raise_for_status()
    if len(data.content) > max_bytes:
        raise ValueError("media too large")
    return data.content, info.get("mime_type", "image/jpeg")


def send_audio(to: str, mp3: bytes) -> dict:
    """Upload an MP3 (Amazon Polly) as WhatsApp media, then send it as an audio message."""
    phone_id = get_secret("whatsapp/phone_number_id")
    up = httpx.post(_graph(f"{phone_id}/media"), headers=_headers(), timeout=httpx.Timeout(20.0, connect=3.0),
                    data={"messaging_product": "whatsapp", "type": "audio/mpeg"},
                    files={"file": ("reply.mp3", mp3, "audio/mpeg")})
    up.raise_for_status()
    payload = {"messaging_product": "whatsapp", "to": to, "type": "audio", "audio": {"id": up.json()["id"]}}
    r = httpx.post(_graph(f"{phone_id}/messages"), json=payload, headers=_headers(), timeout=TIMEOUT)
    r.raise_for_status()
    return r.json()
