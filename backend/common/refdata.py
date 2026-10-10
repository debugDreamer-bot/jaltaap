"""Static reference data: grid, hotspots and relief points (Delhi seed, other cities, OpenStreetMap).

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


def _located(*names: str) -> list[dict]:
    """Rows from several files, without rows that have no coordinates; first file wins on duplicate ids."""
    seen, out = set(), []
    for name in names:
        for row in _load(name):
            if row.get("lat") is None or row.get("lon") is None or row.get("id") in seen:
                continue
            seen.add(row.get("id"))
            out.append(row)
    return out


def hotspots() -> list[dict]:
    """Delhi's listed hotspots plus researched hotspots in other cities (data/hotspots_cities.json)."""
    return _located("hotspots", "hotspots_cities")


def relief_points() -> list[dict]:
    """Delhi seed points, researched relief places in other cities, and OpenStreetMap hospitals and
    drinking-water points for every covered city."""
    return _located("relief_points", "relief_cities", "relief_osm")


def clear() -> None:
    _cache.clear()
