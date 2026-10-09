"""Shared helpers for the JalTaap backtests: paths, cached Open-Meteo calls, small utilities.

Every HTTP response is cached on disk under backtests/.cache/openmeteo/ (gitignored), keyed by
the full request URL, so reruns make no network calls. Pass --refresh to a script to bypass it.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx

ROOT = Path(__file__).resolve().parent.parent
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

CACHE = ROOT / "backtests" / ".cache" / "openmeteo"
OUT = ROOT / "backtests" / "outputs"
DATA = ROOT / "data"

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
PREVIOUS_RUNS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
ARCHIVE_VARS = "temperature_2m,relative_humidity_2m,apparent_temperature,wet_bulb_temperature_2m,precipitation"
TZ = "Asia/Kolkata"
IST = "+05:30"

SOURCE = "Open-Meteo Historical Weather API (modelled reanalysis, not station readings)"
CAPTION = "Modelled data: Open-Meteo Historical Weather API (reanalysis)"

SAFDARJUNG = {"id": "safdarjung", "name": "Safdarjung", "lat": 28.58, "lon": 77.21}

_last_call = [0.0]


def parse_args(description: str) -> argparse.Namespace:
    ap = argparse.ArgumentParser(description=description)
    ap.add_argument("--refresh", action="store_true", help="bypass the on-disk HTTP cache")
    return ap.parse_args()


def get_json(base: str, params: dict, refresh: bool = False):
    """GET base?params, cached on disk. Polite: at most ~2 network calls per second."""
    url = f"{base}?{urlencode(params)}"
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:24] + ".json")
    if path.exists() and not refresh:
        return json.loads(path.read_text(encoding="utf-8"))["body"]
    CACHE.mkdir(parents=True, exist_ok=True)
    wait = 0.5 - (time.monotonic() - _last_call[0])
    if wait > 0:
        time.sleep(wait)
    _last_call[0] = time.monotonic()
    r = httpx.get(base, params=params, timeout=120)
    if r.status_code != 200:
        raise RuntimeError(f"HTTP {r.status_code} for {url}: {r.text[:500]}")
    body = r.json()
    path.write_text(json.dumps({"url": url, "body": body}), encoding="utf-8")
    return body


def _multi(base: str, points: list[dict], extra: dict, refresh: bool, batch: int = 40) -> list[dict]:
    """Call a multi-location Open-Meteo endpoint in batches; return one response per point, in order."""
    out: list[dict] = []
    for i in range(0, len(points), batch):
        chunk = points[i:i + batch]
        params = {
            "latitude": ",".join(f"{p['lat']}" for p in chunk),
            "longitude": ",".join(f"{p['lon']}" for p in chunk),
            **extra,
            "timezone": TZ,
        }
        body = get_json(base, params, refresh)
        body = body if isinstance(body, list) else [body]
        if len(body) != len(chunk):
            raise RuntimeError(f"expected {len(chunk)} locations, got {len(body)}")
        out.extend(body)
    return out


def archive(points: list[dict], start: str, end: str, refresh: bool = False) -> list[dict]:
    """Hourly archive (reanalysis) data for each point: dict of lists keyed by variable + 'time'."""
    resp = _multi(ARCHIVE_URL, points, {"start_date": start, "end_date": end, "hourly": ARCHIVE_VARS}, refresh)
    return [_hourly(r) for r in resp]


def previous_runs(points: list[dict], start: str, end: str, hourly: str, refresh: bool = False) -> list[dict]:
    resp = _multi(PREVIOUS_RUNS_URL, points, {"start_date": start, "end_date": end, "hourly": hourly}, refresh)
    return [_hourly(r) for r in resp]


def _hourly(resp: dict) -> dict:
    h = dict(resp["hourly"])
    h["_model_lat"] = resp.get("latitude")
    h["_model_lon"] = resp.get("longitude")
    h["_elevation"] = resp.get("elevation")
    return h


def iso(local_time: str) -> str:
    """'2026-07-09T06:00' -> '2026-07-09T06:00:00+05:30'."""
    return f"{local_time[:16]}:00{IST}"


def cell_lookup() -> dict[str, dict]:
    from risk.grid import cells
    return {c["id"]: c for c in cells()}


def load_hotspots(with_coords_only: bool = True) -> list[dict]:
    rows = json.loads((DATA / "hotspots.json").read_text(encoding="utf-8"))
    return [r for r in rows if r["lat"] is not None and r["lon"] is not None] if with_coords_only else rows


def write_json(path: Path, obj, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
    else:
        text = json.dumps(obj, indent=2, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))
