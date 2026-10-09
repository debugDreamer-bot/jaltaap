"""Build the replay files served by GET /replay/{scenario} (spec 12.3, docs/api-contract.md).

Writes backtests/outputs/replays/<scenario>.json and index.json:
  heat-2026-05-22     18 May 00:00 to 25 May 23:00 IST
  flood-2026-07-09    8 Jul 00:00 to 10 Jul 00:00 IST
  humid-heat-<date>   humid_heat_date from Backtest A (heat_2026_summary.json), 00:00 to 23:00

Every hour carries heat for all 36 cells (base hourly band from risk.heat.hour_band) and flood
for every geocoded hotspot (risk.flood.score_hotspot on its snapped cell's rain, with the 24 h
before the window as antecedent). Hotspots without coordinates are omitted.

Modelled data: Open-Meteo Historical Weather API (reanalysis), not station readings.

Run:  .venv/bin/python backtests/build_replays.py [--refresh]   (after backtests/heat_2026.py)
"""
from __future__ import annotations

import json
from datetime import date, timedelta

from _common import OUT, SOURCE, archive, iso, load_hotspots, parse_args, rel, write_json

from risk.flood import rain_windows, score_hotspot
from risk.grid import cells, snap
from risk.heat import hour_band
from risk.wetbulb import wet_bulb_or_compute

REPLAYS = OUT / "replays"


def _d(s: str) -> date:
    return date.fromisoformat(s)


def nice_date(d: date) -> str:
    return f"{d.day} {d.strftime('%B')} {d.year}"


def build(scenario: str, label: str, first: str, last: str, refresh: bool) -> dict:
    """first/last are local hour strings 'YYYY-MM-DDTHH:00' (inclusive)."""
    grid = cells()
    fetch_start = (_d(first[:10]) - timedelta(days=1)).isoformat()   # 24 h antecedent
    fetch_end = (_d(last[:10]) + timedelta(days=1)).isoformat()      # 3 h look-ahead at the end
    data = archive(grid, fetch_start, fetch_end, refresh)
    times = data[0]["time"]
    for d in data:
        assert d["time"] == times, "archive returned different time axes"
    by_cell = {c["id"]: d for c, d in zip(grid, data)}

    spots = load_hotspots(with_coords_only=True)
    spot_cell = {s["id"]: snap(s["lat"], s["lon"]) for s in spots}
    precip = {cid: [v or 0.0 for v in d["precipitation"]] for cid, d in by_cell.items()}

    hours = []
    for i, t in enumerate(times):
        if not (first <= t <= last):
            continue
        heat = {}
        for c in grid:
            d = by_cell[c["id"]]
            temp, rh, wb = d["temperature_2m"][i], d["relative_humidity_2m"][i], d["wet_bulb_temperature_2m"][i]
            if temp is None or rh is None:
                raise RuntimeError(f"missing temperature/RH for {c['id']} at {t}")
            wb = wet_bulb_or_compute(wb, temp, rh)
            heat[c["id"]] = {"band": hour_band(temp, wb), "temp_c": round(temp, 1), "rh": int(round(rh)),
                             "wet_bulb_c": round(wb, 1)}
        flood = {}
        for s in spots:
            n1, n3, l24 = rain_windows(precip[spot_cell[s["id"]]], i)
            r = score_hotspot(s, rain_next_1h_mm=n1, rain_next_3h_mm=n3, rain_last_24h_mm=l24)
            flood[s["id"]] = {"level": r["level"], "risk": r["risk"], "rain_1h_mm": r["rain_next_1h_mm"],
                              "rain_3h_mm": r["rain_next_3h_mm"]}
        hours.append({"time": iso(t), "heat": heat, "flood": flood})

    return {
        "scenario": scenario,
        "label": label,
        "source": SOURCE,
        "cells": [{k: c[k] for k in ("id", "lat", "lon", "bounds")} for c in grid],
        "hotspots": [{k: s[k] for k in ("id", "name", "type", "agency", "lat", "lon")} for s in spots],
        "hours": hours,
    }


def main() -> None:
    args = parse_args(__doc__.splitlines()[0])
    summary_a = OUT / "heat_2026_summary.json"
    if not summary_a.exists():
        raise SystemExit("run backtests/heat_2026.py first (needs humid_heat_date)")
    humid = json.loads(summary_a.read_text(encoding="utf-8"))["humid_heat_date"]

    specs = [
        ("heat-2026-05-22", "Replay: modelled data for 22 May 2026", "heat", "2026-05-18T00:00", "2026-05-25T23:00"),
        ("flood-2026-07-09", "Replay: modelled data for 9 July 2026", "flood", "2026-07-08T00:00", "2026-07-10T00:00"),
        (f"humid-heat-{humid}", f"Replay: modelled data for {nice_date(_d(humid))} (humid heat)", "heat",
         f"{humid}T00:00", f"{humid}T23:00"),
    ]
    REPLAYS.mkdir(parents=True, exist_ok=True)
    keep = {f"{sid}.json" for sid, *_ in specs} | {"index.json"}
    for old in REPLAYS.glob("*.json"):   # drop stale humid-heat files if the date changed
        if old.name not in keep:
            old.unlink()
    index = []
    for sid, label, kind, first, last in specs:
        rep = build(sid, label, first, last, args.refresh)
        path = REPLAYS / f"{sid}.json"
        write_json(path, rep, compact=True)
        index.append({"id": sid, "label": label, "kind": kind})
        bands = {}
        for h in rep["hours"]:
            for v in h["heat"].values():
                bands[v["band"]] = bands.get(v["band"], 0) + 1
        levels = {}
        for h in rep["hours"]:
            for v in h["flood"].values():
                levels[v["level"]] = levels.get(v["level"], 0) + 1
        tmax = max(v["temp_c"] for h in rep["hours"] for v in h["heat"].values())
        wbmax = max(v["wet_bulb_c"] for h in rep["hours"] for v in h["heat"].values())
        print(f"{rel(path)}: {path.stat().st_size / 1024:.0f} KB, {len(rep['hours'])} hours, "
              f"{len(rep['hotspots'])} hotspots, cell-hour bands {bands}, hotspot-hour levels {levels}, "
              f"max temp {tmax}, max wet-bulb {wbmax}")
    write_json(REPLAYS / "index.json", {"scenarios": index})
    print("wrote", rel(REPLAYS / "index.json"))


if __name__ == "__main__":
    main()
