"""Live-location warnings: one set of deterministic rules for the web banner and Telegram live location.

Input is a /now summary (risk.service.now_summary), so every warning comes from the same engines as
the map, the chat and the alerts. No LLM. Severity: 1 advisory, 2 warning, 3 danger.
"""
from __future__ import annotations

from risk.heat import band_index

LOOKAHEAD_H = 3
SENSITIVE = {"age_60_plus", "pregnant", "chronic_illness"}   # people the air advice singles out

HEAT_SEVERITY = {"ORANGE": 2, "RED": 3}
FLOOD_SEVERITY = {"MEDIUM": 1, "HIGH": 2, "SEVERE": 3, "CONFIRMED": 3}
AIR_SEVERITY = {"POOR": 2, "VERY_POOR": 3, "SEVERE": 3}
UV_SEVERITY = {"VERY_HIGH": 1, "EXTREME": 2}


def assess(summary: dict, profile: list[str] | None = None) -> list[dict]:
    """Warnings for the next few hours at one point, most severe first.

    Each warning is {"hazard", "severity", "level", ...hazard details}; clients render the words.
    """
    prof = set(profile or [])
    hours = (summary.get("hours") or [])[:LOOKAHEAD_H]
    out = []

    heat = [h for h in hours if h.get("band") in HEAT_SEVERITY]
    if heat:
        worst = max(heat, key=lambda h: band_index(h["band"]))
        out.append({"hazard": "heat", "severity": HEAT_SEVERITY[worst["band"]], "level": worst["band"],
                    "at": worst["time"], "temp_c": worst.get("temp_c"), "wet_bulb_c": worst.get("wet_bulb_c")})

    levels = [h for h in hours if h.get("area_flood_level") in FLOOD_SEVERITY]
    if levels:
        worst = max(levels, key=lambda h: FLOOD_SEVERITY[h["area_flood_level"]])
        out.append({"hazard": "rain", "severity": FLOOD_SEVERITY[worst["area_flood_level"]],
                    "level": worst["area_flood_level"], "rain_mm": worst.get("rain_next_3h_mm")})

    air = summary.get("air") or {}
    cat = air.get("category")
    air_sev = AIR_SEVERITY.get(cat) or (1 if cat == "MODERATE" and prof & SENSITIVE else 0)
    if air_sev:
        out.append({"hazard": "air", "severity": air_sev, "level": cat, "aqi": air.get("aqi")})

    uv = summary.get("uv") or {}
    if uv.get("now_category") in UV_SEVERITY:
        out.append({"hazard": "uv", "severity": UV_SEVERITY[uv["now_category"]], "level": uv["now_category"],
                    "uv_index": uv.get("now")})

    return sorted(out, key=lambda w: -w["severity"])


def top_key(warnings: list[dict], min_severity: int = 2) -> str:
    """'heat:RED' for the worst warning at or above min_severity, '' when all clear (used to dedupe)."""
    for w in warnings:
        if w["severity"] >= min_severity:
            return f"{w['hazard']}:{w['level']}"
    return ""
