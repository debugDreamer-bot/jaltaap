"""Crew heat schedule for site supervisors. Pure functions driven by risk.yaml (crew section).

Built on the same heat plan as a worker's reply, so the crew roster can never disagree with what
each worker is told: heavy work only in the plan's heavy_work_windows (which already exclude the
noon pause), otherwise light work, with work/rest minutes and water set by the hour's band.
Rest is staggered across groups so the site never stops entirely and the shade is never crowded.
"""
from __future__ import annotations

import math
from string import ascii_uppercase

from risk.config_loader import crew_config
from risk.heat import band_index, worse


def _hour(text: str) -> int:
    return int(text.split(":")[0])


def _in_windows(hour: int, windows: list[dict]) -> bool:
    return any(_hour(w["from"]) <= hour < _hour(w["to"]) for w in windows)


def rotation(crew_size: int, rest_min: int) -> list[dict]:
    """Split the crew so one group rests at a time: 15-minute rests give four groups, and so on."""
    if rest_min <= 0 or rest_min >= 60:
        return [{"group": "A", "workers": crew_size, "rest": "all" if rest_min >= 60 else "none"}]
    groups = max(1, min(crew_size, round(60 / rest_min)))
    size = math.ceil(crew_size / groups)
    out = []
    for i in range(groups):
        n = min(size, crew_size - i * size)
        if n <= 0:
            break
        start = i * rest_min
        out.append({"group": ascii_uppercase[i], "workers": n,
                    "rest": f":{start:02d}-:{min(60, start + rest_min):02d}"})
    return out


def crew_schedule(plan: dict, *, crew_size: int, shift_from: str | None = None, shift_to: str | None = None,
                  heavy_work: bool = True, cfg: dict | None = None) -> dict:
    """Hour-by-hour roster for one crew from a HeatPlan (spec 6.8 contract, with `hours`)."""
    cfg = cfg or crew_config()
    crew_size = max(1, min(int(crew_size), cfg["max_crew"]))
    s0 = _hour(shift_from or cfg["default_shift"]["from"])
    s1 = _hour(shift_to or cfg["default_shift"]["to"])
    if s1 <= s0:
        raise ValueError("shift must end after it starts, on the same day")
    by_hour = {int(h["time"][11:13]): h for h in plan["hours"]}
    rows = []
    for hr in range(s0, s1):
        h = by_hour.get(hr)
        if h is None:
            continue
        band = h["band"]
        heavy_ok = heavy_work and _in_windows(hr, plan["heavy_work_windows"])
        activity = "heavy" if heavy_ok else "light"
        work, rest = cfg["work_rest_min"][activity][band]
        if work == 0:
            activity = "rest"
        rows.append({"time": f"{hr:02d}:00", "band": band, "temp_c": h["temp_c"], "wet_bulb_c": h["wet_bulb_c"],
                     "activity": activity, "work_min": work, "rest_min": rest,
                     "water_ml_per_worker": cfg["water_ml_per_hour"][band],
                     "rotation": rotation(crew_size, rest)})
    if not rows:
        raise ValueError("no forecast hours inside the shift")

    blocks: list[dict] = []
    for r in rows:
        key = (r["band"], r["activity"], r["work_min"], r["rest_min"])
        if blocks and blocks[-1]["_key"] == key:
            blocks[-1]["to"] = f"{_hour(r['time']) + 1:02d}:00"
        else:
            blocks.append({"_key": key, "from": r["time"], "to": f"{_hour(r['time']) + 1:02d}:00", "band": r["band"],
                           "activity": r["activity"], "work_min": r["work_min"], "rest_min": r["rest_min"],
                           "water_ml_per_worker_per_hour": r["water_ml_per_worker"],
                           "groups": len(r["rotation"])})
    for b in blocks:
        b.pop("_key")

    water_ml = sum(r["water_ml_per_worker"] for r in rows)
    worst = "GREEN"
    for r in rows:
        worst = worse(worst, r["band"])
    heavy_hours = [r["time"] for r in rows if r["activity"] == "heavy"]
    return {
        "kind": "crew_schedule",
        "location": plan["location"],
        "date": plan["date"],
        "source": plan.get("source", "open-meteo"),
        "data_updated_at": plan["data_updated_at"],
        "crew_size": crew_size,
        "shift": {"from": f"{s0:02d}:00", "to": f"{s1:02d}:00"},
        "worst_band": worst,
        "noon_pause": plan.get("noon_pause"),
        "heavy_work_hours": heavy_hours,
        "no_heavy_work": heavy_work and not heavy_hours,
        "blocks": blocks,
        "hours": rows,
        "work_minutes_per_worker": sum(r["work_min"] for r in rows),
        "water": {"litres_per_worker": round(water_ml / 1000, 1),
                  "litres_total": math.ceil(water_ml * crew_size / 1000),
                  "glasses_per_worker": math.ceil(water_ml / cfg["glass_ml"])},
        "ors_needed": band_index(worst) >= band_index("RED"),
    }
