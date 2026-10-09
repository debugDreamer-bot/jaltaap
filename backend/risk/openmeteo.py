"""Open-Meteo Forecast API client with timeouts, retries and a 30-minute cache.

Docs: https://open-meteo.com/en/docs. No API key. Free tier: non-commercial, under 10,000 calls
a day, 5,000 an hour, 600 a minute, CC BY 4.0 ("Weather data by Open-Meteo.com").
Several points fit in one request as comma-separated latitude and longitude lists.
"""
from __future__ import annotations

import time

import httpx

from common.ids import iso, now_ist

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
HOURLY = "temperature_2m,relative_humidity_2m,apparent_temperature,wet_bulb_temperature_2m,precipitation,precipitation_probability"
DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum"
CACHE_TTL_S = 30 * 60

_cache: dict[str, tuple[float, list[dict]]] = {}


class OpenMeteoError(RuntimeError):
    pass


def _get(params: dict, attempts: int = 3) -> object:
    last: Exception | None = None
    for i in range(attempts):
        try:
            r = httpx.get(FORECAST_URL, params=params, timeout=httpx.Timeout(8.0, connect=3.0))
            if r.status_code == 429 or r.status_code >= 500:
                raise OpenMeteoError(f"open-meteo {r.status_code}")
            r.raise_for_status()
            return r.json()
        except (httpx.HTTPError, OpenMeteoError) as err:
            last = err
            time.sleep(0.4 * (2 ** i))
    raise OpenMeteoError(f"open-meteo unavailable: {last}")


def _parse(raw: dict, fetched_at: str) -> dict:
    h = raw.get("hourly", {})
    d = raw.get("daily", {})
    return {
        "lat": raw.get("latitude"),
        "lon": raw.get("longitude"),
        "fetched_at": fetched_at,
        "time": h.get("time", []),
        "temp_c": h.get("temperature_2m", []),
        "rh": h.get("relative_humidity_2m", []),
        "apparent_c": h.get("apparent_temperature", []),
        "wet_bulb_c": h.get("wet_bulb_temperature_2m", []),
        "precip_mm": h.get("precipitation", []),
        "precip_prob": h.get("precipitation_probability", []),
        "daily": {"time": d.get("time", []), "tmax": d.get("temperature_2m_max", []),
                  "tmin": d.get("temperature_2m_min", []), "precip": d.get("precipitation_sum", [])},
    }


def fetch_points(points: list[tuple[float, float]], *, forecast_days: int = 3, past_days: int = 2,
                 use_cache: bool = True) -> list[dict]:
    """Hourly + daily forecast for each (lat, lon), in Asia/Kolkata local time."""
    key = f"{forecast_days}|{past_days}|" + ";".join(f"{la:.2f},{lo:.2f}" for la, lo in points)
    hit = _cache.get(key)
    if use_cache and hit and time.time() - hit[0] < CACHE_TTL_S:
        return hit[1]
    params = {
        "latitude": ",".join(f"{la:.4f}" for la, _ in points),
        "longitude": ",".join(f"{lo:.4f}" for _, lo in points),
        "hourly": HOURLY, "daily": DAILY, "timezone": "Asia/Kolkata",
        "forecast_days": forecast_days, "past_days": past_days,
    }
    raw = _get(params)
    fetched_at = iso(now_ist())
    items = raw if isinstance(raw, list) else [raw]
    parsed = [_parse(r, fetched_at) for r in items]
    if len(parsed) != len(points):
        raise OpenMeteoError("open-meteo returned a different number of locations")
    _cache[key] = (time.time(), parsed)
    return parsed


def fetch_point(lat: float, lon: float, **kw) -> dict:
    """Personal lookups are rounded to 0.01 degree (about 1 km) so nearby users share the cache."""
    return fetch_points([(round(lat, 2), round(lon, 2))], **kw)[0]


def clear_cache() -> None:
    _cache.clear()
