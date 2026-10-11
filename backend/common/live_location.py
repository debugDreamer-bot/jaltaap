"""Telegram live location: refresh the user's area as they move and warn only when the risk changes.

Telegram re-sends a live location every few seconds to minutes, so this path never calls the LLM:
the check reuses /now's engines and rules (risk.warnings), runs at most every LIVE_RECHECK per
~1 km cell, and sends a fixed template only when the worst warning changes (or repeats after
LIVE_REPEAT while it lasts). Only geohash6 (about 1 km) is stored, as for every other location.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from common import i18n
from common.geo import geohash
from common.ids import now_ist
from risk import service
from risk.warnings import top_key

LIVE_RECHECK = timedelta(minutes=15)
LIVE_REPEAT = timedelta(hours=2)


def render(warning: dict, summary: dict, lang: str) -> str:
    footer = i18n.footer(summary["data_updated_at"], lang)
    hazard = warning["hazard"]
    if hazard == "heat":
        temp = warning.get("temp_c")
        return i18n.t("live_heat", lang, band=i18n.band_word(warning["level"], lang),
                      temp=round(temp) if temp is not None else "?", footer=footer)
    if hazard == "rain":
        rain = warning.get("rain_mm")
        return i18n.t("live_rain", lang, level=i18n.level_word(warning["level"], lang),
                      rain=round(rain, 1) if rain is not None else "?", footer=footer)
    if hazard == "air":
        return i18n.t("live_air", lang, cat=i18n.aqi_word(warning["level"], lang), aqi=warning.get("aqi", "?"),
                      footer=footer)
    return i18n.t("live_uv", lang, uv=warning.get("uv_index", "?"), footer=footer)


def check(user: dict, lat: float, lon: float, lang: str, *, baseline: bool = False) -> tuple[str | None, dict]:
    """Returns (message to send or None, user fields to save).

    baseline=True (the first live pin, which already gets a full agent answer) records the current
    risk without messaging, so the next move only warns if something changed.
    """
    now = now_ist()
    stamp = now.isoformat(timespec="seconds")
    gh = geohash(lat, lon, 6)
    fields = {"last_geohash6": gh, "last_location_at": stamp}
    checked = user.get("live_checked_at")
    if not baseline and gh == user.get("live_checked_geohash6") and checked \
            and datetime.fromisoformat(checked) > now - LIVE_RECHECK:
        return None, fields
    summary = service.now_summary(lat, lon, profile=user.get("profile"))
    fields.update(live_checked_geohash6=gh, live_checked_at=stamp)
    warnings = summary["warnings"]
    key = top_key(warnings)
    last_key, last_at = user.get("live_warning", ""), user.get("live_warning_at")
    if baseline:
        fields.update(live_warning=key, live_warning_at=stamp)
        return None, fields
    if key:
        repeat_due = bool(last_at) and datetime.fromisoformat(last_at) < now - LIVE_REPEAT
        if key == last_key and not repeat_due:
            return None, fields
        fields.update(live_warning=key, live_warning_at=stamp)
        return render(warnings[0], summary, lang), fields
    if last_key:
        fields.update(live_warning="", live_warning_at=stamp)
        return i18n.t("live_clear", lang, footer=i18n.footer(summary["data_updated_at"], lang)), fields
    return None, fields
