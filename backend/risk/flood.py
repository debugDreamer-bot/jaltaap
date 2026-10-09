"""Waterlogging risk for listed hotspots. Pure functions driven by risk.yaml.

risk = min(1, susceptibility x rain_factor + antecedent_bonus). A verified report within
confirm_radius_m in the last confirm_window_h hours sets the level to CONFIRMED, above
SEVERE, whatever the model says.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from common.geo import haversine_m
from risk.config_loader import flood_config

LEVEL_ORDER = ["LOW", "MEDIUM", "HIGH", "SEVERE", "CONFIRMED"]


def level_index(level: str) -> int:
    return LEVEL_ORDER.index(level)


def susceptibility(years_seen: int, spot_type: str, cfg: dict | None = None) -> float:
    s = (cfg or flood_config())["susceptibility"]
    value = s["base"] + s["per_extra_year_listed"] * max(0, years_seen - 1)
    if spot_type == "underpass":
        value += s["underpass_bonus"]
    return round(min(s["max"], value), 4)


def rain_factor(next_1h_mm: float, next_3h_mm: float, cfg: dict | None = None) -> float:
    """First row where either rain threshold is met; 0 if none."""
    for row in (cfg or flood_config())["rain_factor"]:
        if next_1h_mm >= row["next_1h_mm"]:
            return row["factor"]
        if "next_3h_mm" in row and next_3h_mm >= row["next_3h_mm"]:
            return row["factor"]
    return 0.0


def antecedent_bonus(last_24h_mm: float, cfg: dict | None = None) -> float:
    a = (cfg or flood_config())["antecedent_bonus"]
    return a["add"] if last_24h_mm >= a["last_24h_mm"] else 0.0


def level_for(risk: float, cfg: dict | None = None) -> str:
    lv = (cfg or flood_config())["levels"]
    if risk >= lv["SEVERE"]:
        return "SEVERE"
    if risk >= lv["HIGH"]:
        return "HIGH"
    if risk >= lv["MEDIUM"]:
        return "MEDIUM"
    return "LOW"


def crowd_confirmations(spot: dict, reports: list[dict], now: datetime, cfg: dict | None = None) -> int:
    """Verified reports within the radius and time window of a spot.

    A report counts when its status is verified or confirmed and its confidence meets
    min_confidence. Reports carry lat, lon, created_at (ISO with offset), status, confidence.
    """
    c = (cfg or flood_config())["crowd"]
    since = now - timedelta(hours=c["confirm_window_h"])
    n = 0
    for r in reports:
        if r.get("status") not in ("verified", "confirmed"):
            continue
        if float(r.get("confidence", 0)) < c["min_confidence"]:
            continue
        created = datetime.fromisoformat(r["created_at"])
        if not (since <= created <= now):
            continue
        if haversine_m(spot["lat"], spot["lon"], r["lat"], r["lon"]) <= c["confirm_radius_m"]:
            n += 1
    return n


def score_hotspot(
    spot: dict,
    *,
    rain_next_1h_mm: float,
    rain_next_3h_mm: float,
    rain_last_24h_mm: float,
    reports: list[dict] | None = None,
    now: datetime | None = None,
    cfg: dict | None = None,
) -> dict:
    """Score one hotspot. `spot` needs id, name, type, agency, years_seen (int), lat, lon."""
    cfg = cfg or flood_config()
    susc = susceptibility(int(spot["years_seen"]), spot["type"], cfg)
    rf = rain_factor(rain_next_1h_mm, rain_next_3h_mm, cfg)
    risk = round(min(1.0, susc * rf + antecedent_bonus(rain_last_24h_mm, cfg)), 4)
    level = level_for(risk, cfg)
    confirmed = crowd_confirmations(spot, reports or [], now, cfg) if (reports and now) else 0
    if confirmed:
        level = "CONFIRMED"
    return {
        "id": spot["id"],
        "name": spot["name"],
        "type": spot["type"],
        "agency": spot["agency"],
        "lat": spot["lat"],
        "lon": spot["lon"],
        "level": level,
        "risk": risk,
        "susceptibility": susc,
        "rain_next_1h_mm": round(rain_next_1h_mm, 1),
        "rain_next_3h_mm": round(rain_next_3h_mm, 1),
        "rain_last_24h_mm": round(rain_last_24h_mm, 1),
        "confirmed_reports": confirmed,
    }


def rain_windows(precip: list[float], index: int) -> tuple[float, float, float]:
    """From an hourly precipitation series, return (next 1h, next 3h, last 24h) at `index`.

    "Next 1h" is the hour starting at `index`; "last 24h" is the 24 hours before it.
    """
    nxt1 = sum(v or 0 for v in precip[index:index + 1])
    nxt3 = sum(v or 0 for v in precip[index:index + 3])
    last24 = sum(v or 0 for v in precip[max(0, index - 24):index])
    return nxt1, nxt3, last24
