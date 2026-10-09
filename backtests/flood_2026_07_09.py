"""Backtest C: the 9 July 2026 storm (spec 13.6).

Each geocoded hotspot (data/hotspots.json) is snapped to its grid cell (risk.grid.snap). Hourly
precipitation for all 36 cells comes from the Open-Meteo archive for 7 Jul 00:00 to 10 Jul
23:00 IST (7 Jul gives the 24 h antecedent for 8 Jul; 10 Jul gives the 3 h look-ahead at the
end). Every hotspot is scored hourly from 8 Jul 00:00 to 9 Jul 23:00 with risk.flood.score_hotspot
and risk.flood.rain_windows, using the archive rain as if it were a perfect forecast.

Ranking: peak level (worst first), then first time at HIGH or above (earliest first), then
peak risk. The top 20 are compared with the places named in reports: hotspots whose `years`
include 2026, split by evidence type (waterlogging vs traffic_disruption).

Run:  .venv/bin/python backtests/flood_2026_07_09.py [--refresh]
"""
from __future__ import annotations

import csv

from _common import OUT, SOURCE, archive, iso, load_hotspots, parse_args, rel, write_json

from risk.flood import LEVEL_ORDER, level_index, rain_windows, score_hotspot
from risk.grid import cells, snap

FETCH_START, FETCH_END = "2026-07-07", "2026-07-10"
SCORE_FROM, SCORE_TO = "2026-07-08T00:00", "2026-07-09T23:00"
TOP_N = 20
HIGH = level_index("HIGH")


def fetch_cells(refresh: bool) -> tuple[list[str], dict[str, list[float]]]:
    grid = cells()
    data = archive(grid, FETCH_START, FETCH_END, refresh)
    times = data[0]["time"]
    return times, {c["id"]: [v or 0.0 for v in d["precipitation"]] for c, d in zip(grid, data)}


def score_series(spot: dict, times: list[str], precip: list[float], years_seen: int | None = None) -> list[dict]:
    s = dict(spot)
    if years_seen is not None:
        s["years_seen"] = years_seen
    out = []
    for i, t in enumerate(times):
        if not (SCORE_FROM <= t <= SCORE_TO):
            continue
        n1, n3, l24 = rain_windows(precip, i)
        r = score_hotspot(s, rain_next_1h_mm=n1, rain_next_3h_mm=n3, rain_last_24h_mm=l24)
        out.append({"time": t, "level": r["level"], "risk": r["risk"], "rain_1h_mm": r["rain_next_1h_mm"],
                    "rain_3h_mm": r["rain_next_3h_mm"], "rain_24h_mm": r["rain_last_24h_mm"],
                    "susceptibility": r["susceptibility"]})
    return out


def summarise_spot(spot: dict, cell: str, series: list[dict], times: list[str], precip: list[float]) -> dict:
    peak = max(series, key=lambda r: (level_index(r["level"]), r["risk"]))
    first_high = next((r["time"] for r in series if level_index(r["level"]) >= HIGH), None)
    window = [(t, p) for t, p in zip(times, precip) if SCORE_FROM <= t <= SCORE_TO]
    peak_rain_t, peak_rain = max(window, key=lambda x: x[1])
    return {
        "id": spot["id"], "name": spot["name"], "type": spot["type"], "cell": cell,
        "years": spot["years"], "evidence": spot["evidence"], "reported_2026": 2026 in spot["years"],
        "susceptibility": series[0]["susceptibility"],
        "peak_level": peak["level"], "peak_risk": peak["risk"], "peak_level_time": iso(peak["time"]),
        "first_high_plus_time": iso(first_high) if first_high else None,
        "hours_high_plus": sum(1 for r in series if level_index(r["level"]) >= HIGH),
        "peak_rain_hour": iso(peak_rain_t), "peak_rain_1h_mm": round(peak_rain, 1),
    }


def rank(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (-level_index(r["peak_level"]),
                                       r["first_high_plus_time"] or "9999", -r["peak_risk"], r["id"]))


def compare(ranked: list[dict]) -> dict:
    top = ranked[:TOP_N]
    top_ids = {r["id"] for r in top}
    high_ids = {r["id"] for r in ranked if level_index(r["peak_level"]) >= HIGH}
    out = {}
    for ev in ("waterlogging", "traffic_disruption"):
        rep = [r for r in ranked if r["reported_2026"] and r["evidence"] == ev]
        out[ev] = {
            "reported_2026_with_coords": len(rep),
            "in_top_20": sum(1 for r in rep if r["id"] in top_ids),
            "reached_high_plus": sum(1 for r in rep if r["id"] in high_ids),
            "ids": [r["id"] for r in rep],
            "ids_reached_high_plus": [r["id"] for r in rep if r["id"] in high_ids],
        }
    not_rep = [r for r in ranked if not r["reported_2026"]]
    out["not_reported_2026"] = {
        "count": len(not_rep),
        "in_top_20": sum(1 for r in not_rep if r["id"] in top_ids),
        "reached_high_plus": sum(1 for r in not_rep if r["id"] in high_ids),
    }
    return out


def main() -> None:
    args = parse_args(__doc__.splitlines()[0])
    all_spots = load_hotspots(with_coords_only=False)
    spots = [s for s in all_spots if s["lat"] is not None]
    skipped = [s["id"] for s in all_spots if s["lat"] is None]
    times, precip = fetch_cells(args.refresh)

    hourly_rows, per_spot, per_spot_no2026 = [], [], []
    for s in spots:
        cell = snap(s["lat"], s["lon"])
        series = score_series(s, times, precip[cell])
        per_spot.append(summarise_spot(s, cell, series, times, precip[cell]))
        for r in series:
            hourly_rows.append({"hotspot_id": s["id"], "cell": cell, "time": iso(r["time"]),
                                **{k: r[k] for k in ("level", "risk", "rain_1h_mm", "rain_3h_mm", "rain_24h_mm")}})
        # Leakage check: susceptibility without the 2026 listing (2026-only spots get years_seen 0 -> base).
        prior_years = len([y for y in s["years"] if y < 2026])
        series_b = score_series(s, times, precip[cell], years_seen=prior_years)
        per_spot_no2026.append(summarise_spot(s, cell, series_b, times, precip[cell]))

    ranked = rank(per_spot)
    for i, r in enumerate(ranked, 1):
        r["rank"] = i
    ranked_b = rank(per_spot_no2026)

    with open(OUT / "flood_2026_07_09.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(hourly_rows[0].keys()))
        w.writeheader()
        w.writerows(hourly_rows)

    # Context: total model rain per cell on 9 Jul (00:00-23:00 IST) and the 8-9 Jul window.
    day9 = {cid: round(sum(p for t, p in zip(times, series) if t.startswith("2026-07-09")), 1)
            for cid, series in precip.items()}
    two_day = {cid: round(sum(p for t, p in zip(times, series) if SCORE_FROM <= t <= SCORE_TO), 1)
               for cid, series in precip.items()}
    max_1h = {cid: round(max(p for t, p in zip(times, series) if SCORE_FROM <= t <= SCORE_TO), 1)
              for cid, series in precip.items()}
    wettest = max(day9, key=day9.get)
    over_100 = sorted(c for c, v in day9.items() if v > 100)
    level_counts = {lv: sum(1 for r in ranked if r["peak_level"] == lv) for lv in LEVEL_ORDER[:4]}
    cmp = compare(ranked)
    cmp_b = compare(ranked_b)

    summary = {
        "backtest": "C: 9 July 2026 storm",
        "label": "modelled data",
        "data": SOURCE,
        "rain_as_forecast": "archive (reanalysis) hourly rain used as a perfect forecast; a real forecast would be worse",
        "scored_hours": {"from": iso(SCORE_FROM), "to": iso(SCORE_TO)},
        "hotspots_scored": len(spots),
        "hotspots_skipped_no_coords": skipped,
        "peak_level_counts": level_counts,
        "top_n": TOP_N,
        "top_20_note": f"Only {len(spots)} hotspots have coordinates, so the top {TOP_N} covers {TOP_N}/{len(spots)} of the list; overlap with reports is close to automatic and is not evidence of skill on its own. reached_high_plus is the more informative count.",
        "comparison_with_reports": cmp,
        "comparison_without_2026_listing": {
            "note": "Leakage check: years_seen recomputed without 2026, because 2026 listings come from the same season's reports. Rain is unchanged.",
            **cmp_b,
            "peak_level_counts": {lv: sum(1 for r in ranked_b if r["peak_level"] == lv) for lv in LEVEL_ORDER[:4]},
        },
        "lead_time": "Cannot be measured precisely: the reports used here carry no timestamps. first_high_plus_time and peak_rain_hour per spot are given; no report time has been assumed.",
        "ranking": ranked,
        "rain_context": {
            "cell_total_9_jul_mm": dict(sorted(day9.items(), key=lambda kv: -kv[1])),
            "cell_total_8_to_9_jul_mm": dict(sorted(two_day.items(), key=lambda kv: -kv[1])),
            "cell_max_1h_8_to_9_jul_mm": dict(sorted(max_1h.items(), key=lambda kv: -kv[1])),
            "wettest_cell_9_jul": {"id": wettest, "mm": day9[wettest]},
            "cells_over_100_mm_9_jul": over_100,
            "reflects_over_100_mm_reports": bool(over_100),
            "note": "Grid rain is a ~10-25 km model average; local gauges in a storm can record far more than any grid cell.",
        },
        "caveats": [
            "Modelled data: Open-Meteo archive rain is reanalysis on a coarse grid (~10-25 km), not rain-gauge readings.",
            "Reports describe traffic disruption and waterlogging, not measured water depth; a report is not a depth threshold being crossed.",
            "The hotspot list is itself built from news reports (including 2026 ones), so every scored spot is a known trouble spot; the comparison cannot test false alarms at unlisted places.",
            "Several hotspots share a grid cell, so they share one rain series; differences between them come only from susceptibility (years listed, underpass bonus).",
            "Hotspot coordinates are geocoded and unverified (needs_check=true).",
        ],
    }
    write_json(OUT / "flood_2026_07_09_summary.json", summary)

    print(f"scored {len(spots)} hotspots (skipped {skipped}); peak levels {level_counts}")
    for r in ranked:
        print(f"{r['rank']:2d} {r['id']:24s} {r['cell']:12s} peak={r['peak_level']:7s} risk={r['peak_risk']:.2f} "
              f"first_high={r['first_high_plus_time']} rain_peak={r['peak_rain_1h_mm']}@{r['peak_rain_hour'][5:16]} rep2026={r['reported_2026']}")
    print("compare:", {k: {kk: vv for kk, vv in v.items() if not kk.startswith('ids')} for k, v in cmp.items()})
    print("compare w/o 2026:", {k: v for k, v in summary["comparison_without_2026_listing"].items() if k != "note"})
    print("9 Jul cell totals (top 8):", list(summary["rain_context"]["cell_total_9_jul_mm"].items())[:8])
    print("cells > 100 mm on 9 Jul:", over_100)
    print("wrote", rel(OUT / "flood_2026_07_09.csv"), rel(OUT / "flood_2026_07_09_summary.json"))


if __name__ == "__main__":
    main()
