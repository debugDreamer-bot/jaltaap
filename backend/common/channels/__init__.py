"""One send() for every channel, so handlers never branch on channel details."""
from __future__ import annotations

from common.aws import client
from common.config import settings


def send(channel: str, channel_id: str, text: str) -> None:
    if channel == "whatsapp":
        from common.channels import whatsapp
        whatsapp.send_text(channel_id, text)
    elif channel == "telegram":
        from common.channels import telegram
        telegram.send_message(channel_id, text)
    elif channel == "email":
        send_email(channel_id, "JalTaap alert", text)
    else:
        raise ValueError(f"unsupported channel {channel}")


def send_audio(channel: str, channel_id: str, mp3: bytes) -> None:
    if channel == "whatsapp":
        from common.channels import whatsapp
        whatsapp.send_audio(channel_id, mp3)
    elif channel == "telegram":
        from common.channels import telegram
        telegram.send_audio(channel_id, mp3)
    else:
        raise ValueError(f"audio is not supported on {channel}")


def send_email(to: str, subject: str, body: str) -> None:
    """Amazon SES. New accounts are in the sandbox: only verified addresses can receive."""
    sender = settings().officer_email_from
    if not sender:
        raise RuntimeError("OFFICER_EMAIL_FROM is not set")
    client("ses").send_email(Source=sender, Destination={"ToAddresses": [to]},
                             Message={"Subject": {"Data": subject}, "Body": {"Text": {"Data": body}}})
