"""Glue between Open-Meteo series and the pure risk engine.

Used by the agent tools, the hourly refresh and the public API, so every surface shows the
same numbers from the same unit-tested code.
"""
from __future__ import annotations

from datetime import date as Date, datetime, timedelta

from common.config import IST
from common.ids import now_ist
from risk import grid as gridmod
from risk.flood import rain_windows, score_area, score_hotspot
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
    """Personal plan for a point, rounded to 0.01 degree (about 1 km), cached 30 minutes.

    forecast_days=4: just after midnight IST, Open-Meteo's "today" can still be the previous date,
    so 4 days keeps the day after tomorrow covered (crew plans and the 3-day outlook need it)."""
    day = day or now_ist().date().isoformat()
    series = fetch_point(lat, lon, forecast_days=4, past_days=2)
    return heat_plan_from_series(series, lat=lat, lon=lon, label=label, day=day, profile=profile)


def grid_series(city_id: str | None = None) -> dict[str, dict]:
    """Forecast series for every grid cell of every covered city (or one city), batched requests."""
    cells = gridmod.cells(city_id)
    # past_days=2: the duration rule needs the previous two days' bands
    data = fetch_points([(c["lat"], c["lon"]) for c in cells], forecast_days=3, past_days=2)
    return {c["id"]: s for c, s in zip(cells, data)}


def point_series(points: list[tuple[float, float]]) -> list[dict]:
    """Forecast series for arbitrary points (subscribers outside every city grid), 0.01 degree rounding."""
    return fetch_points([(round(la, 2), round(lo, 2)) for la, lo in points], forecast_days=3, past_days=2)


def heat_hours(series: dict, start: datetime, hours: int = 49) -> list[dict]:
    """Hourly heat rows for one cell from `start` (IST hour) for `hours` hours.

    Each row also carries the next-3-hour rain and the generic area waterlogging level, so cities
    without listed hotspots still get a rain signal on the map and in alerts.
    """
    first = start.astimezone(IST).strftime("%Y-%m-%dT%H:00")
    precip = [v or 0.0 for v in series.get("precip_mm", [])]
    out = []
    for i, t in enumerate(series["time"]):
        if t < first or len(out) >= hours:
            continue
        temp, rh = series["temp_c"][i], series["rh"][i]
        if temp is None or rh is None:
            continue
        wb = wet_bulb_or_compute(series["wet_bulb_c"][i] if i < len(series["wet_bulb_c"]) else None, temp, rh)
        row = {"time": f"{t}:00+05:30", "band": hour_band(temp, wb), "temp_c": round(temp, 1),
               "rh": round(rh), "wet_bulb_c": round(wb, 1)}
        if precip:
            n1, n3, l24 = rain_windows(precip, i)
            area = score_area(rain_next_1h_mm=n1, rain_next_3h_mm=n3, rain_last_24h_mm=l24)
            row.update(rain_next_3h_mm=area["rain_next_3h_mm"], area_flood_level=area["level"])
        out.append(row)
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
    """Live flood scores for the current hour (no cache), used when RiskCache is empty. Any city's hotspots."""
    if not spots:
        return [], now_ist().isoformat(timespec="seconds")
    # fetch only the grid cells these spots snap to (a tool call must stay fast)
    cell_of = lambda s: gridmod.nearest_cell(s["lat"], s["lon"])   # noqa: E731
    spots = [s for s in spots if cell_of(s)]
    if not spots:
        return [], now_ist().isoformat(timespec="seconds")
    cell_ids = sorted({cell_of(s) for s in spots})
    by_id = {c["id"]: c for c in gridmod.cells()}
    data = fetch_points([(by_id[c]["lat"], by_id[c]["lon"]) for c in cell_ids], forecast_days=3, past_days=2)
    series_by_cell = dict(zip(cell_ids, data))
    start = now_ist()
    out = []
    for spot in spots:
        series = series_by_cell[cell_of(spot)]
        rows = flood_hours(series, spot, start, hours=1, reports=reports)
        if rows:
            out.append(rows[0])
    any_series = next(iter(series_by_cell.values()))
    return out, any_series["fetched_at"]


def air_now(lat: float, lon: float, now: datetime | None = None) -> dict:
    """India AQI estimate (24 h mean PM) and UV now plus today's peak UV, from the air-quality model."""
    from risk.air import india_aqi, mean_last, uv_category, UV_ADVICE
    from risk.openmeteo import fetch_air
    now = (now or now_ist()).astimezone(IST)
    a = fetch_air(lat, lon)
    hour = now.strftime("%Y-%m-%dT%H:00")
    if hour not in a["time"]:
        return {"air": None, "uv": None, "uv_hours": {}}
    i = a["time"].index(hour)
    aq = india_aqi(mean_last(a["pm2_5"], i), mean_last(a["pm10"], i))
    today = hour[:10]
    day_uv = [v for t, v in zip(a["time"], a["uv_index"]) if t.startswith(today) and v is not None]
    uv_now = a["uv_index"][i]
    peak = max(day_uv) if day_uv else None
    uv = None
    if uv_now is not None or peak is not None:
        cat = uv_category(peak)
        uv = {"now": None if uv_now is None else round(uv_now, 1), "now_category": uv_category(uv_now),
              "today_max": None if peak is None else round(peak, 1), "today_category": cat,
              "advice_keys": UV_ADVICE.get(cat or "LOW", [])}
    uv_hours = {f"{t}:00+05:30": round(v, 1) for t, v in zip(a["time"], a["uv_index"]) if v is not None}
    return {"air": aq, "uv": uv, "uv_hours": uv_hours, "air_updated_at": a["fetched_at"]}


def now_summary(lat: float, lon: float, *, label: str = "") -> dict:
    """Everything a worker needs on one screen, from the same engines as every other surface."""
    now = now_ist()
    series = fetch_point(lat, lon, forecast_days=4, past_days=2)
    plan = heat_plan_from_series(series, lat=lat, lon=lon, label=label, day=now.date().isoformat())
    hours = heat_hours(series, now, 48)
    try:
        extra = air_now(lat, lon, now)
    except Exception:  # noqa: BLE001 - air quality is a bonus; heat still answers
        extra = {"air": None, "uv": None, "uv_hours": {}}
    for h in hours:
        h["uv_index"] = extra["uv_hours"].get(h["time"])
    cov = gridmod.coverage(lat, lon)
    current = hours[0] if hours else None
    days = []   # today and the next two days, the same plan a worker gets in chat
    for offset in range(3):
        day = (now.date() + timedelta(days=offset)).isoformat()
        try:
            p = plan if offset == 0 else heat_plan_from_series(series, lat=lat, lon=lon, label=label, day=day)
        except ValueError:
            continue   # the forecast does not reach that day
        day_hours = [h for h in p["hours"] if 6 <= int(h["time"][11:13]) < 20]
        days.append({"date": day, "day_band": p["day_band"], "heavy_work_windows": p["heavy_work_windows"],
                     "noon_pause": p["noon_pause"],
                     "max_temp_c": max((h["temp_c"] for h in day_hours), default=None),
                     "max_wet_bulb_c": max((h["wet_bulb_c"] for h in day_hours), default=None)})
    return {
        "location": {"lat": round(lat, 4), "lon": round(lon, 4), "label": label or cov["city_name"] or "",
                     "city": cov["city_name"], "city_id": cov["city_id"], "coverage": cov["tier"]},
        "now": current,
        "today": {k: plan[k] for k in ("date", "day_band", "blocks", "heavy_work_windows", "avoid_windows",
                                       "noon_pause", "peak_hour", "last_night_min_c", "escalations", "advice_keys")},
        "air": extra["air"],
        "uv": extra["uv"],
        "hours": hours,
        "days": days,
        "source": "open-meteo",
        "data_updated_at": series["fetched_at"],
    }
