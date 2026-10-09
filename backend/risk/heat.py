"""Heat bands and the personal heat plan. Pure functions driven by risk.yaml.

An hour matches a band if wet-bulb is at or above the band's wet_bulb_c OR temperature is at
or above its temp_c. The dry rule catches Delhi's hot-dry May; the wet-bulb rule catches the
humid days a 40 C rule misses.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from risk.config_loader import heat_config
from risk.wetbulb import wet_bulb_or_compute

BAND_ORDER = ["GREEN", "YELLOW", "ORANGE", "RED"]


def band_index(band: str) -> int:
    return BAND_ORDER.index(band)


def worse(a: str, b: str) -> str:
    return a if band_index(a) >= band_index(b) else b


def shift(band: str, steps: int) -> str:
    """Move a band up by `steps`, capped at RED."""
    return BAND_ORDER[min(len(BAND_ORDER) - 1, band_index(band) + steps)]


def hour_band(temp_c: float, wet_bulb_c: float, cfg: dict | None = None) -> str:
    """Base band for one hour: first band (top-down) whose wet-bulb OR temperature rule matches."""
    cfg = cfg or heat_config()
    for row in cfg["bands"]:
        if "wet_bulb_c" not in row:  # GREEN, the catch-all
            return row["name"]
        if wet_bulb_c >= row["wet_bulb_c"] or temp_c >= row["temp_c"]:
            return row["name"]
    return "GREEN"


def _hhmm_to_hour(text: str) -> int:
    return int(text.split(":")[0])


@dataclass
class Escalation:
    environment: list[str] = field(default_factory=list)   # e.g. ["hot_night"]
    profile: list[str] = field(default_factory=list)       # e.g. ["heavy_work"]

    @property
    def steps(self) -> int:
        # environment adds at most +1, profile at most +1
        return (1 if self.environment else 0) + (1 if self.profile else 0)

    def labels(self) -> list[str]:
        return list(self.environment) + [f"profile:{p}" for p in self.profile]


def escalation_for(
    base_day_band: str,
    last_night_min_c: float | None,
    prev_day_bands: list[str] | None,
    profile: list[str] | None,
    cfg: dict | None = None,
) -> Escalation:
    """Work out which escalations apply to a day.

    hot_night: last night's minimum at or above hot_night_min_c.
    duration:  today would be the Nth consecutive day at ORANGE or worse (N = duration_days),
               using the base (un-escalated) day bands of the previous N-1 days.
    profile:   any known profile flag the user declared.
    """
    cfg = cfg or heat_config()
    esc_cfg = cfg["escalate"]
    env: list[str] = []
    if last_night_min_c is not None and last_night_min_c >= esc_cfg["hot_night_min_c"]:
        env.append("hot_night")
    need_prev = esc_cfg["duration_days"] - 1
    prev = list(prev_day_bands or [])[-need_prev:] if need_prev > 0 else []
    if (
        band_index(base_day_band) >= band_index("ORANGE")
        and len(prev) == need_prev
        and all(band_index(b) >= band_index("ORANGE") for b in prev)
    ):
        env.append("duration")
    known = set(esc_cfg["profile_flags"])
    prof = [p for p in (profile or []) if p in known]
    return Escalation(environment=env, profile=prof)


def escalate_band(base: str, esc: Escalation) -> str:
    """Apply escalation to a non-GREEN band (GREEN hours stay GREEN; see DECISIONS.md)."""
    if base == "GREEN":
        return base
    return shift(base, esc.steps)


ADVICE_KEYS = {
    "GREEN": ["work_normal", "water_regular"],
    "YELLOW": ["heavy_work_shade_breaks", "water_every_20_30", "watch_headache_dizziness"],
    "ORANGE": ["heavy_work_morning_evening", "water_every_20", "shade_15_every_hour"],
    "RED": ["stop_heavy_work", "sip_constantly_ors", "check_coworkers", "heatstroke_signs"],
}


@dataclass
class HourInput:
    time: str              # local ISO, e.g. "2026-05-22T13:00"
    temp_c: float
    rh: float
    wet_bulb_c: float | None = None
    apparent_c: float | None = None


def _blocks(hours: list[dict], key: str) -> list[dict]:
    """Group consecutive hours with the same band into {from, to, band} blocks."""
    out: list[dict] = []
    for h in hours:
        hr = int(h["time"][11:13])
        if out and out[-1]["band"] == h[key] and out[-1]["_end"] == hr:
            out[-1]["_end"] = hr + 1
        else:
            out.append({"band": h[key], "_start": hr, "_end": hr + 1})
    return [{"from": f"{b['_start']:02d}:00", "to": f"{b['_end'] % 24:02d}:00" if b["_end"] < 24 else "24:00",
             "band": b["band"]} for b in out]


def _windows(hours: list[dict], predicate) -> list[dict]:
    out: list[dict] = []
    for h in hours:
        hr = int(h["time"][11:13])
        if not predicate(h):
            continue
        if out and out[-1]["_end"] == hr:
            out[-1]["_end"] = hr + 1
        else:
            out.append({"_start": hr, "_end": hr + 1})
    return [{"from": f"{w['_start']:02d}:00", "to": f"{w['_end']:02d}:00"} for w in out]


def build_heat_plan(
    *,
    location: dict,
    date: str,
    hours: list[HourInput],
    last_night_min_c: float | None,
    prev_day_bands: list[str] | None = None,
    profile: list[str] | None = None,
    source: str = "open-meteo",
    data_updated_at: str,
    cfg: dict | None = None,
) -> dict:
    """Build the HeatPlan contract (spec section 6.8) for one date at one location.

    `hours` are that date's local hours. Only hours inside day_band_window form blocks,
    windows and the day band; all hours are returned in `hours` with their bands.
    """
    cfg = cfg or heat_config()
    win = cfg["day_band_window"]
    start_h, end_h = _hhmm_to_hour(win["from"]), _hhmm_to_hour(win["to"])

    rows = []
    for h in hours:
        wb = wet_bulb_or_compute(h.wet_bulb_c, h.temp_c, h.rh)
        rows.append({
            "time": h.time[:16],
            "temp_c": round(h.temp_c, 1),
            "rh": round(h.rh),
            "wet_bulb_c": round(wb, 1),
            "base_band": hour_band(h.temp_c, wb, cfg),
        })
    day_rows = [r for r in rows if start_h <= int(r["time"][11:13]) < end_h]
    base_day = "GREEN"
    for r in day_rows:
        base_day = worse(base_day, r["base_band"])

    esc = escalation_for(base_day, last_night_min_c, prev_day_bands, profile, cfg)
    for r in rows:
        r["band"] = escalate_band(r["base_band"], esc)
    day_band = escalate_band(base_day, esc)

    keys = list(ADVICE_KEYS[day_band])
    pause = cfg["noon_pause"]
    noon_pause = band_index(day_band) >= band_index(pause["min_band"])
    if noon_pause:
        keys.insert(1, "noon_pause")

    heavy_ok = _windows(day_rows, lambda r: band_index(r["band"]) <= band_index("YELLOW"))
    if noon_pause:
        p0, p1 = _hhmm_to_hour(pause["from"]), _hhmm_to_hour(pause["to"])
        heavy_ok = _windows(
            day_rows,
            lambda r: band_index(r["band"]) <= band_index("YELLOW") and not (p0 <= int(r["time"][11:13]) < p1),
        )

    peak = max(day_rows, key=lambda r: (band_index(r["band"]), r["wet_bulb_c"], r["temp_c"])) if day_rows else None
    return {
        "kind": "heat_plan",
        "location": location,
        "date": date,
        "source": source,
        "data_updated_at": data_updated_at,
        "day_band": day_band,
        "base_day_band": base_day,
        "escalations": esc.labels(),
        "blocks": _blocks(day_rows, "band"),
        "heavy_work_windows": heavy_ok,
        "avoid_windows": _windows(day_rows, lambda r: band_index(r["band"]) >= band_index("ORANGE")),
        "noon_pause": {"from": pause["from"], "to": pause["to"]} if noon_pause else None,
        "peak_hour": {k: peak[k] for k in ("time", "temp_c", "rh", "wet_bulb_c", "band")} if peak else None,
        "last_night_min_c": last_night_min_c,
        "hours": [{k: r[k] for k in ("time", "temp_c", "rh", "wet_bulb_c", "band")} for r in rows],
        "advice_keys": keys,
    }


def day_band_from_hours(hours: list[HourInput], cfg: dict | None = None) -> str:
    """Base (un-escalated) day band: worst hour inside the day window. Used for backtests."""
    cfg = cfg or heat_config()
    win = cfg["day_band_window"]
    s, e = _hhmm_to_hour(win["from"]), _hhmm_to_hour(win["to"])
    band = "GREEN"
    for h in hours:
        if s <= int(h.time[11:13]) < e:
            band = worse(band, hour_band(h.temp_c, wet_bulb_or_compute(h.wet_bulb_c, h.temp_c, h.rh), cfg))
    return band
