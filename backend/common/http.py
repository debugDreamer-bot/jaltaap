"""Helpers for API Gateway HTTP API (payload format 2.0) events."""
from __future__ import annotations

import base64
import json
from typing import Any

from common.config import settings

MAX_BODY = 1 * 1024 * 1024


def raw_body(event: dict) -> bytes:
    body = event.get("body") or ""
    return base64.b64decode(body) if event.get("isBase64Encoded") else body.encode("utf-8")


def json_body(event: dict) -> Any:
    data = raw_body(event)
    if len(data) > MAX_BODY:
        raise ValueError("body too large")
    return json.loads(data or b"{}")


def header(event: dict, name: str) -> str | None:
    return (event.get("headers") or {}).get(name.lower())


def query(event: dict) -> dict:
    return event.get("queryStringParameters") or {}


def source_ip(event: dict) -> str:
    return ((event.get("requestContext") or {}).get("http") or {}).get("sourceIp", "unknown")


def respond(status: int, body: Any = None, *, text: str | None = None, cache_s: int = 0) -> dict:
    headers = {"Content-Type": "text/plain; charset=utf-8" if text is not None else "application/json"}
    headers["Cache-Control"] = f"public, max-age={cache_s}" if cache_s else "no-store"
    return {"statusCode": status, "headers": headers,
            "body": text if text is not None else json.dumps(body, ensure_ascii=False, default=str)}


def error(status: int, message: str) -> dict:
    return respond(status, {"error": message, "status": status})


def cors_origin() -> str:
    return settings().web_origin
