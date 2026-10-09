"""Static reference data: grid, hotspots and relief points.

Primary copy lives in S3 under data/*.json (uploaded by scripts/seed_s3.sh). A copy is bundled
in backend/refdata/ as a fallback so the API works even if S3 is unreachable.
Rows without coordinates (geocoding failed) are skipped: coordinates are never invented.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from common.aws import client
from common.config import settings

BUNDLED = Path(__file__).resolve().parent.parent / "refdata"
TTL_S = 15 * 60
_cache: dict[str, tuple[float, list]] = {}


def _load(name: str) -> list:
    hit = _cache.get(name)
    if hit and time.time() - hit[0] < TTL_S:
        return hit[1]
    data = None
    bucket = settings().bucket
    if bucket:
        try:
            body = client("s3").get_object(Bucket=bucket, Key=f"data/{name}.json")["Body"].read()
            data = json.loads(body)
        except Exception:  # noqa: BLE001 - fall back to the bundled copy
            data = None
    if data is None:
        path = BUNDLED / f"{name}.json"
        data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
    _cache[name] = (time.time(), data)
    return data


def hotspots() -> list[dict]:
    return [h for h in _load("hotspots") if h.get("lat") is not None and h.get("lon") is not None]


def relief_points() -> list[dict]:
    return [p for p in _load("relief_points") if p.get("lat") is not None and p.get("lon") is not None]


def clear() -> None:
    _cache.clear()
