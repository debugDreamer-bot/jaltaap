"""Glue between Open-Meteo series and the pure risk engine.

Used by the agent tools, the hourly refresh and the public API, so every surface shows the
same numbers from the same unit-tested code.
"""
from __future__ import annotations

from datetime import date as Date, datetime, timedelta

from common.config import IST
from common.ids import now_ist
from risk import grid as gridmod
from risk.flood import rain_windows, score_hotspot
from risk.heat import HourInput, build_heat_plan, day_band_from_hours, hour_band
from risk.openmeteo import fetch_point, fetch_points
from risk.wetbulb import wet_bulb_or_compute


def _hour_inputs(series: dict, day: str) -> list[HourInput]:
    out = []
    for i, t in enumerate(series["time"]):
        if t.startswith(day) and series["temp_c"][i] is not None and series["rh"][i] is not None:
            wb = series["wet_bulb_c"][i] if i < len(series["wet_bulb_c"]) else None
            out.append(HourInput(time=t, temp_c=series["temp_c"][i], rh=series["rh"][i], wet_bulb_c=wb,
                                 apparent_c=series["apparent_c"][i] if i < len(series["apparent_c"]) else None))
    return out


def _last_night_min(series: dict, day: str) -> float | None:
    """Minimum temperature from 20:00 the evening before to 08:00 on `day`."""
    d = Date.fromisoformat(day)
    start = f"{(d - timedelta(days=1)).isoformat()}T20:00"
    end = f"{day}T08:00"
    vals = [series["temp_c"][i] for i, t in enumerate(series["time"])
            if start <= t < end and series["temp_c"][i] is not None]
    return round(min(vals), 1) if vals else None


def heat_plan_from_series(series: dict, *, lat: float, lon: float, label: str, day: str,
                          profile: list[str] | None = None) -> dict:
    hours = _hour_inputs(series, day)
    if not hours:
        raise ValueError(f"no forecast hours for {day}")
    d = Date.fromisoformat(day)
    prev_bands = []
    for back in (2, 1):
        prev = _hour_inputs(series, (d - timedelta(days=back)).isoformat())
        if prev:
            prev_bands.append(day_band_from_hours(prev))
    return build_heat_plan(
        location={"lat": round(lat, 4), "lon": round(lon, 4), "label": label},
        date=day, hours=hours, last_night_min_c=_last_night_min(series, day), prev_day_bands=prev_bands,
        profile=profile or [], source="open-meteo", data_updated_at=series["fetched_at"],
    )


def heat_plan(lat: float, lon: float, *, label: str, day: str | None = None, profile: list[str] | None = None) -> dict:
    """Personal plan for a point, rounded to 0.01 degree (about 1 km), cached 30 minutes."""
    day = day or now_ist().date().isoformat()
    series = fetch_point(lat, lon, forecast_days=3, past_days=2)
    return heat_plan_from_series(series, lat=lat, lon=lon, label=label, day=day, profile=profile)


def grid_series() -> dict[str, dict]:
    """Forecast series for all 36 grid cells in one Open-Meteo request."""
    cells = gridmod.cells()
    # past_days=2: the duration rule needs the previous two days' bands
    data = fetch_points([(c["lat"], c["lon"]) for c in cells], forecast_days=3, past_days=2)
    return {c["id"]: s for c, s in zip(cells, data)}


def heat_hours(series: dict, start: datetime, hours: int = 49) -> list[dict]:
    """Hourly heat rows for one cell from `start` (IST hour) for `hours` hours."""
    first = start.astimezone(IST).strftime("%Y-%m-%dT%H:00")
    out = []
    for i, t in enumerate(series["time"]):
        if t < first or len(out) >= hours:
            continue
        temp, rh = series["temp_c"][i], series["rh"][i]
        if temp is None or rh is None:
            continue
        wb = wet_bulb_or_compute(series["wet_bulb_c"][i] if i < len(series["wet_bulb_c"]) else None, temp, rh)
        out.append({"time": f"{t}:00+05:30", "band": hour_band(temp, wb), "temp_c": round(temp, 1),
                    "rh": round(rh), "wet_bulb_c": round(wb, 1)})
    return out


def flood_hours(series: dict, spot: dict, start: datetime, hours: int = 49, reports=None) -> list[dict]:
    """Hourly flood scores for one hotspot from its snapped cell's precipitation."""
    first = start.astimezone(IST).strftime("%Y-%m-%dT%H:00")
    precip = [v or 0.0 for v in series["precip_mm"]]
    out = []
    for i, t in enumerate(series["time"]):
        if t < first or len(out) >= hours:
            continue
        n1, n3, l24 = rain_windows(precip, i)
        when = datetime.fromisoformat(f"{t}:00+05:30")
        # crowd reports only confirm the current hour; future hours are model-only
        s = score_hotspot(spot, rain_next_1h_mm=n1, rain_next_3h_mm=n3, rain_last_24h_mm=l24,
                          reports=reports if not out else None, now=when)
        s["time"] = f"{t}:00+05:30"
        out.append(s)
    return out


def flood_now_for_spots(spots: list[dict], reports: list[dict] | None = None) -> tuple[list[dict], str]:
    """Live flood scores for the current hour (no cache), used when RiskCache is empty."""
    if not spots:
        return [], now_ist().isoformat(timespec="seconds")
    series_by_cell = grid_series()
    start = now_ist()
    out = []
    for spot in spots:
        series = series_by_cell[gridmod.snap(spot["lat"], spot["lon"])]
        rows = flood_hours(series, spot, start, hours=1, reports=reports)
        if rows:
            out.append(rows[0])
    any_series = next(iter(series_by_cell.values()))
    return out, any_series["fetched_at"]
