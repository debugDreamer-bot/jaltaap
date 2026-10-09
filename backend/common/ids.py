"""User identity: users are keyed by sha256(salt + channel + id), never by phone number."""
from __future__ import annotations

import hashlib
from datetime import datetime

from ulid import ULID

from common.config import IST
from common.secrets import get_secret


def user_hash(channel: str, channel_user_id: str) -> str:
    salt = get_secret("hash_salt")
    return hashlib.sha256(f"{salt}{channel}{channel_user_id}".encode("utf-8")).hexdigest()


def new_ulid() -> str:
    return str(ULID())


def now_ist() -> datetime:
    return datetime.now(IST)


def iso(dt: datetime) -> str:
    return dt.astimezone(IST).isoformat(timespec="seconds")


def hour_iso(dt: datetime) -> str:
    """Truncate to the hour, IST, e.g. 2026-10-09T17:00:00+05:30."""
    return dt.astimezone(IST).replace(minute=0, second=0, microsecond=0).isoformat(timespec="seconds")
