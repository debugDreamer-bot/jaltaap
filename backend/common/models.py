"""pydantic models shared by handlers."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Channel = Literal["whatsapp", "telegram", "web"]
MessageType = Literal["text", "location", "image", "audio", "interactive", "unknown"]


class InboundMessage(BaseModel):
    """One normalised inbound message, as queued on InboundQueue."""
    channel: Channel
    channel_user_id: str          # WhatsApp wa_id or Telegram chat id; never logged, never shown to the model
    message_id: str
    type: MessageType
    text: str | None = None
    lat: float | None = None
    lon: float | None = None
    media_id: str | None = None   # WhatsApp media id or Telegram file_id
    caption: str | None = None
    timestamp: int | None = None


class PhotoVerdict(BaseModel):
    """Strict schema for the Bedrock vision verdict (spec 8.2)."""
    model_config = ConfigDict(extra="forbid")

    relevant: bool
    hazard_type: Literal["waterlogging", "pipe_leak", "tanker_issue", "heat_relief_issue", "other"]
    water_depth: Literal["none", "ankle", "knee", "waist_or_more", "unknown"]
    vehicles_stalled: bool
    electrical_hazard_visible: bool
    people_at_risk_visible: bool
    severity: int = Field(ge=1, le=5)
    confidence: float = Field(ge=0.0, le=1.0)
    summary_en: str
    summary_hi: str

    @field_validator("summary_en", "summary_hi")
    @classmethod
    def under_20_words(cls, v: str) -> str:
        if len(v.split()) > 20:
            raise ValueError("summary must stay under 20 words")
        return v


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    lat: float | None = None
    lon: float | None = None


class UploadUrlRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    lat: float
    lon: float
    note: str | None = Field(default=None, max_length=280)


class StatusPatch(BaseModel):
    status: Literal["confirmed", "resolved", "false"]
