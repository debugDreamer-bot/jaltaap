"""Non-secret settings from environment variables. Secrets come from common.secrets (SSM)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
VERSION = "0.1.0"


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


@dataclass(frozen=True)
class Settings:
    region: str = field(default_factory=lambda: _env("AWS_REGION", "ap-south-1"))
    model_id: str = field(default_factory=lambda: _env("MODEL_ID", ""))
    fallback_model_id: str = field(default_factory=lambda: _env("FALLBACK_MODEL_ID", ""))
    vision_model_id: str = field(default_factory=lambda: _env("VISION_MODEL_ID", "") or _env("MODEL_ID", ""))
    bedrock_region: str = field(default_factory=lambda: _env("BEDROCK_REGION", "ap-south-1"))
    # "bedrock" in every deployed stack; "ollama" only for free local development (scripts/dev_api.py)
    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "bedrock").lower())
    ollama_host: str = field(default_factory=lambda: _env("OLLAMA_HOST", "http://127.0.0.1:11434"))
    users_table: str = field(default_factory=lambda: _env("USERS_TABLE", "jaltaap-users"))
    subscriptions_table: str = field(default_factory=lambda: _env("SUBSCRIPTIONS_TABLE", "jaltaap-subscriptions"))
    risk_table: str = field(default_factory=lambda: _env("RISK_TABLE", "jaltaap-risk"))
    reports_table: str = field(default_factory=lambda: _env("REPORTS_TABLE", "jaltaap-reports"))
    conversations_table: str = field(default_factory=lambda: _env("CONVERSATIONS_TABLE", "jaltaap-conversations"))
    idempotency_table: str = field(default_factory=lambda: _env("IDEMPOTENCY_TABLE", "jaltaap-idempotency"))
    bucket: str = field(default_factory=lambda: _env("BUCKET", ""))
    inbound_queue_url: str = field(default_factory=lambda: _env("INBOUND_QUEUE_URL", ""))
    alert_queue_url: str = field(default_factory=lambda: _env("ALERT_QUEUE_URL", ""))
    imd_enabled: bool = field(default_factory=lambda: _env("IMD_ENABLED", "false").lower() == "true")
    web_origin: str = field(default_factory=lambda: _env("WEB_ORIGIN", "*"))
    ssm_prefix: str = field(default_factory=lambda: _env("SSM_PREFIX", "/jaltaap"))
    whatsapp_graph_version: str = field(default_factory=lambda: _env("WHATSAPP_GRAPH_VERSION", "v23.0"))
    location_index_region: str = field(default_factory=lambda: _env("LOCATION_REGION", "ap-south-1"))
    officer_email_from: str = field(default_factory=lambda: _env("OFFICER_EMAIL_FROM", ""))
    voice_enabled: bool = field(default_factory=lambda: _env("VOICE_ENABLED", "false").lower() == "true")
    polly_voice: str = field(default_factory=lambda: _env("POLLY_VOICE", "Kajal"))


def settings() -> Settings:
    """Fresh read each call is cheap; tests can monkeypatch os.environ."""
    return Settings()
