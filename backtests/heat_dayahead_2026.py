"""Backtest B: day-ahead skill of the JalTaap heat band at Safdarjung (spec 13.5).

Predicted: Open-Meteo Previous Runs API, temperature_2m_previous_day1 and
relative_humidity_2m_previous_day1 (the forecast for each hour issued about one day earlier),
wet-bulb by Stull (2011), base day band with risk.heat.day_band_from_hours.
Observed: the archive (reanalysis) base day band from Backtest A
(backtests/outputs/heat_2026.csv, Safdarjung rows).

Both sides are modelled: this measures how well a one-day-old forecast anticipates the
model's own later analysis, not how well it matches a thermometer.

Run:  .venv/bin/python backtests/heat_dayahead_2026.py [--refresh]
      (run backtests/heat_2026.py first)
"""
from __future__ import annotations

import csv

from _common import OUT, SAFDARJUNG, parse_args, previous_runs, rel, write_json

from risk.config_loader import heat_config
from risk.heat import HourInput, band_index, day_band_from_hours
from risk.wetbulb import stull_wet_bulb

START, END = "2026-04-01", "2026-07-31"
VARS = "temperature_2m,temperature_2m_previous_day1,relative_humidity_2m_previous_day1"
ORANGE = band_index("ORANGE")


def scores(pairs: list[tuple[str, str]]) -> dict:
    """pairs = [(predicted, observed)]. ORANGE-or-worse treated as the event."""
    hits = sum(1 for p, o in pairs if band_index(p) >= ORANGE and band_index(o) >= ORANGE)
    misses = sum(1 for p, o in pairs if band_index(p) < ORANGE and band_index(o) >= ORANGE)
    false_alarms = sum(1 for p, o in pairs if band_index(p) >= ORANGE and band_index(o) < ORANGE)
    correct_neg = sum(1 for p, o in pairs if band_index(p) < ORANGE and band_index(o) < ORANGE)
    obs_pos, pred_pos = hits + misses, hits + false_alarms
    return {
        "days": len(pairs),
        "observed_orange_plus": obs_pos,
        "predicted_orange_plus": pred_pos,
        "hits": hits,
        "misses": misses,
        "false_alarms": false_alarms,
        "correct_negatives": correct_neg,
        "hit_rate": round(hits / obs_pos, 4) if obs_pos else None,
        "hit_rate_text": f"{hits}/{obs_pos}",
        "false_alarm_ratio": round(false_alarms / pred_pos, 4) if pred_pos else None,
        "false_alarm_ratio_text": f"{false_alarms}/{pred_pos}",
        "exact_band_agreement": f"{sum(1 for p, o in pairs if p == o)}/{len(pairs)}",
        "band_off_by_more_than_one": sum(1 for p, o in pairs if abs(band_index(p) - band_index(o)) > 1),
    }


def main() -> None:
    args = parse_args(__doc__.splitlines()[0])
    a_csv = OUT / "heat_2026.csv"
    if not a_csv.exists():
        raise SystemExit("run backtests/heat_2026.py first (needs backtests/outputs/heat_2026.csv)")
    with open(a_csv, encoding="utf-8") as fh:
        observed = {r["date"]: r for r in csv.DictReader(fh) if r["point_id"] == SAFDARJUNG["id"]}

    try:
        (h,) = previous_runs([SAFDARJUNG], START, END, VARS, args.refresh)
    except Exception as exc:  # report the reason rather than faking numbers
        write_json(OUT / "heat_dayahead_2026_summary.json", {
            "backtest": "B: day-ahead skill", "status": "not run", "reason": str(exc)})
        raise

    cfg = heat_config()
    s, e = int(cfg["day_band_window"]["from"][:2]), int(cfg["day_band_window"]["to"][:2])
    by_day: dict[str, list[HourInput]] = {}
    missing = 0
    for i, t in enumerate(h["time"]):
        tp, rhp = h["temperature_2m_previous_day1"][i], h["relative_humidity_2m_previous_day1"][i]
        if tp is None or rhp is None:
            missing += 1
            continue
        by_day.setdefault(t[:10], []).append(HourInput(time=t, temp_c=tp, rh=rhp, wet_bulb_c=None))

    rows, pairs, pairs_stull = [], [], []
    for d, hours in sorted(by_day.items()):
        if d not in observed:
            continue
        win = [x for x in hours if s <= int(x.time[11:13]) < e]
        if len(win) < e - s:
            continue  # incomplete forecast day: skip rather than score a partial day
        pred = day_band_from_hours(hours, cfg)
        obs = observed[d]
        rows.append({
            "date": d,
            "pred_max_temp_c": round(max(x.temp_c for x in win), 1),
            "pred_max_wet_bulb_c": round(max(stull_wet_bulb(x.temp_c, x.rh) for x in win), 1),
            "pred_day_band": pred,
            "obs_max_temp_c": obs["max_temp_c"],
            "obs_max_wet_bulb_c": obs["max_wet_bulb_c"],
            "obs_day_band": obs["day_band"],
            "obs_day_band_stull": obs["day_band_stull"],
            "pred_orange_plus": band_index(pred) >= ORANGE,
            "obs_orange_plus": band_index(obs["day_band"]) >= ORANGE,
        })
        pairs.append((pred, obs["day_band"]))
        pairs_stull.append((pred, obs["day_band_stull"]))

    # How close is the archive to the forecast API's own day-0 values (same grid point)?
    # Hourly archive values are not in heat_2026.csv, so compare the daily window max.
    same_max = sum(1 for r in rows if r["date"] in observed and _day0_max(h, r["date"], s, e) == float(r["obs_max_temp_c"]))

    with open(OUT / "heat_dayahead_2026.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    main_scores = scores(pairs)
    humid = [r for r in rows if observed[r["date"]]["missed"] == "True"]
    humid_caught = [r["date"] for r in humid if r["pred_orange_plus"]]
    summary = {
        "backtest": "B: day-ahead skill of the JalTaap base day band at Safdarjung",
        "label": "modelled data",
        "period": {"start": START, "end": END, "timezone": "Asia/Kolkata"},
        "day_window": "06:00-19:59 IST",
        "predicted": "Open-Meteo Previous Runs API (default best-match model), temperature_2m_previous_day1 and relative_humidity_2m_previous_day1, wet-bulb by Stull",
        "observed": "Open-Meteo Historical Weather API (reanalysis) base day band from Backtest A (API wet-bulb)",
        "model_grid": {"lat": h["_model_lat"], "lon": h["_model_lon"]},
        "event": "base day band ORANGE or RED",
        "scores": main_scores,
        "scores_observed_with_stull_wet_bulb": scores(pairs_stull),
        "humid_missed_days_from_A_caught_day_ahead": {
            "caught": f"{len(humid_caught)}/{len(humid)}",
            "caught_dates": humid_caught,
            "not_caught_dates": [r["date"] for r in humid if not r["pred_orange_plus"]],
        },
        "hours_missing_previous_day1": missing,
        "days_skipped_incomplete": len([d for d in by_day if d in observed]) - len(rows),
        "check_day0_equals_archive": {
            "days_where_previous_runs_day0_window_max_equals_archive_window_max": f"{same_max}/{len(rows)}",
            "note": "For 2026 the archive's best-match data and the Previous Runs day-0 values come from the same model grid point; if they match, 'observed' is effectively the model's own analysis.",
        },
        "sentence": (f"A day ahead, JalTaap's band caught {main_scores['hits']} of {main_scores['observed_orange_plus']} "
                     f"ORANGE-or-worse days at Safdarjung (Apr-Jul 2026); {main_scores['false_alarms']} of "
                     f"{main_scores['predicted_orange_plus']} ORANGE-or-worse forecasts were false alarms. Modelled data on both sides."),
        "caveats": [
            "Both sides are modelled: the forecast is compared with Open-Meteo reanalysis, not IMD station readings. This is forecast consistency, not verified real-world skill.",
            "Predicted wet-bulb uses Stull from forecast temperature and RH; observed uses Open-Meteo wet_bulb_temperature_2m (scores_observed_with_stull_wet_bulb repeats the comparison with Stull on both sides).",
            "One grid point, one season (122 days); counts are small and the hit rate has wide uncertainty.",
            "previous_day1 is, for each hour, the value from the model run about one day earlier (Open-Meteo Previous Runs API); the exact lead time per hour depends on the model's run schedule.",
        ],
    }
    write_json(OUT / "heat_dayahead_2026_summary.json", summary)
    print(summary["sentence"])
    print("scores:", main_scores)
    print("humid days caught:", summary["humid_missed_days_from_A_caught_day_ahead"])
    print("stull-both-sides:", summary["scores_observed_with_stull_wet_bulb"])
    print("day0==archive window max:", summary["check_day0_equals_archive"]["days_where_previous_runs_day0_window_max_equals_archive_window_max"])
    print("wrote", rel(OUT / "heat_dayahead_2026.csv"), rel(OUT / "heat_dayahead_2026_summary.json"))


def _day0_max(h: dict, d: str, s: int, e: int) -> float | None:
    vals = [h["temperature_2m"][i] for i, t in enumerate(h["time"])
            if t[:10] == d and s <= int(t[11:13]) < e and h["temperature_2m"][i] is not None]
    return round(max(vals), 1) if vals else None


if __name__ == "__main__":
    main()
