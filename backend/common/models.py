"""pydantic models shared by handlers."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Channel = Literal["whatsapp", "telegram", "web"]
MessageType = Literal["text", "location", "image", "audio", "interactive", "unknown"]
# Personal risk factors the heat engine knows (risk.yaml heat.escalate.profile_flags); each adds at most +1 band.
PROFILE_FLAGS = ("heavy_work", "age_60_plus", "pregnant", "chronic_illness", "not_acclimatised")


def clean_profile(flags) -> list[str]:
    """Known flags only, in a stable order; anything else is dropped silently."""
    given = set(flags or [])
    return [f for f in PROFILE_FLAGS if f in given]


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
    live: Literal["start", "update"] | None = None   # Telegram live location: first pin, then each move


class PhotoVerdict(BaseModel):
    """Strict schema for the Bedrock vision verdict (spec 8.2)."""
    model_config = ConfigDict(extra="forbid")

    relevant: bool
    hazard_type: Literal["waterlogging", "pipe_leak", "dirty_water", "tanker_issue", "heat_relief_issue", "other"]
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


class Shift(BaseModel):
    """The user's usual outdoor working hours, from their settings (IST, 24-hour HH:MM)."""
    start: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class ChatRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    message: str = Field(min_length=1, max_length=1000)
    lat: float | None = None
    lon: float | None = None
    profile: list[str] = Field(default_factory=list, max_length=len(PROFILE_FLAGS))
    shift: Shift | None = None

    @field_validator("profile", mode="after")
    @classmethod
    def _known_flags(cls, v: list[str]) -> list[str]:
        return clean_profile(v)


class UploadUrlRequest(BaseModel):
    session_id: str = Field(min_length=8, max_length=64)
    lat: float
    lon: float
    note: str | None = Field(default=None, max_length=280)


class StatusPatch(BaseModel):
    """Officer action: change status, or hand the report to another agency (reassign)."""
    status: Literal["confirmed", "resolved", "false"] | None = None
    agency: str | None = Field(default=None, min_length=2, max_length=16)
    note: str | None = Field(default=None, max_length=280)

    @field_validator("agency")
    @classmethod
    def upper(cls, v: str | None) -> str | None:
        return v.upper() if v else v
