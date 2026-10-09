"""Backtest A: humid heat that a 40 C heatwave rule misses (spec 13.4).

Points: Safdarjung (28.58, 77.21) and three grid cells (north-west g_28.8_77.0, east
g_28.6_77.3, south g_28.5_77.2, at the cell centres). Period: 1 April to 31 July 2026.

For each point and day, using the engine's day window 06:00-19:59 IST (risk.yaml
day_band_window, the same hours that form the JalTaap day band):
  max temperature, max wet-bulb, and the JalTaap base (un-escalated) day band.
Counts per point:
  dry_rule_days      max temperature >= 40 C
  jaltaap_orange_plus JalTaap base day band ORANGE or RED
  missed_days        max wet-bulb >= 28 C AND max temperature < 40 C
Wet-bulb is Open-Meteo's wet_bulb_temperature_2m (what the engine uses when supplied); Stull
(2011) from temperature and RH fills any gap, and a Stull-only count is reported as a check.

Modelled data: Open-Meteo Historical Weather API (reanalysis), not station readings.

Run:  .venv/bin/python backtests/heat_2026.py [--refresh]
"""
from __future__ import annotations

import csv
from datetime import date

from _common import CAPTION, OUT, SAFDARJUNG, SOURCE, archive, cell_lookup, parse_args, rel, write_json

from risk.config_loader import heat_config
from risk.heat import HourInput, band_index, day_band_from_hours
from risk.wetbulb import stull_wet_bulb, wet_bulb_or_compute

START, END = "2026-04-01", "2026-07-31"
DRY_RULE_C = 40.0
WB_RULE_C = 28.0
HEADLINE = "{n} days in 2026 were dangerous by humidity but never met a 40 C heatwave rule."


def points() -> list[dict]:
    cells = cell_lookup()
    pts = [dict(SAFDARJUNG)]
    for cid, name in (("g_28.8_77.0", "north-west"), ("g_28.6_77.3", "east"), ("g_28.5_77.2", "south")):
        c = cells[cid]
        pts.append({"id": cid, "name": f"{name} cell {cid}", "lat": c["lat"], "lon": c["lon"]})
    return pts


def daily_rows(pt: dict, h: dict) -> list[dict]:
    cfg = heat_config()
    s = int(cfg["day_band_window"]["from"][:2])
    e = int(cfg["day_band_window"]["to"][:2])
    by_day: dict[str, list[HourInput]] = {}
    for i, t in enumerate(h["time"]):
        temp, rh, wb = h["temperature_2m"][i], h["relative_humidity_2m"][i], h["wet_bulb_temperature_2m"][i]
        if temp is None or rh is None:
            continue
        by_day.setdefault(t[:10], []).append(HourInput(time=t, temp_c=temp, rh=rh, wet_bulb_c=wb))
    rows = []
    for d, hours in sorted(by_day.items()):
        win = [x for x in hours if s <= int(x.time[11:13]) < e]
        if len(win) < e - s:
            print(f"warning: {pt['id']} {d} has {len(win)} of {e - s} window hours")
        if not win:
            continue
        wbs = [wet_bulb_or_compute(x.wet_bulb_c, x.temp_c, x.rh) for x in win]
        stulls = [stull_wet_bulb(x.temp_c, x.rh) for x in win]
        max_t = max(x.temp_c for x in win)
        max_wb = max(wbs)
        band = day_band_from_hours(hours, cfg)
        stull_band = day_band_from_hours([HourInput(x.time, x.temp_c, x.rh, None) for x in hours], cfg)
        rows.append({
            "point_id": pt["id"],
            "date": d,
            "max_temp_c": round(max_t, 1),
            "max_wet_bulb_c": round(max_wb, 1),
            "max_wet_bulb_stull_c": round(max(stulls), 1),
            "full_day_max_temp_c": round(max(x.temp_c for x in hours), 1),
            "api_wet_bulb_missing_hours": sum(1 for x in win if x.wet_bulb_c is None),
            "day_band": band,
            "day_band_stull": stull_band,
            "dry_rule": max_t >= DRY_RULE_C,
            "jaltaap_orange_plus": band_index(band) >= band_index("ORANGE"),
            "missed": max_wb >= WB_RULE_C and max_t < DRY_RULE_C,
            "missed_stull": max(stulls) >= WB_RULE_C and max_t < DRY_RULE_C,
        })
    return rows


def summarise(pt: dict, h: dict, rows: list[dict]) -> dict:
    bands = {b: sum(1 for r in rows if r["day_band"] == b) for b in ("GREEN", "YELLOW", "ORANGE", "RED")}
    return {
        "id": pt["id"],
        "name": pt["name"],
        "requested_lat": pt["lat"],
        "requested_lon": pt["lon"],
        "model_grid_lat": h["_model_lat"],
        "model_grid_lon": h["_model_lon"],
        "days": len(rows),
        "dry_rule_days": sum(r["dry_rule"] for r in rows),
        "jaltaap_orange_plus_days": sum(r["jaltaap_orange_plus"] for r in rows),
        "missed_days": sum(r["missed"] for r in rows),
        "missed_days_stull_check": sum(r["missed_stull"] for r in rows),
        "jaltaap_orange_plus_days_stull_check": sum(band_index(r["day_band_stull"]) >= 2 for r in rows),
        "day_band_counts": bands,
        "max_temp_c": max(r["max_temp_c"] for r in rows),
        "max_temp_date": max(rows, key=lambda r: r["max_temp_c"])["date"],
        "max_wet_bulb_c": max(r["max_wet_bulb_c"] for r in rows),
        "max_wet_bulb_date": max(rows, key=lambda r: r["max_wet_bulb_c"])["date"],
        "missed_dates": [r["date"] for r in rows if r["missed"]],
    }


def chart(rows: list[dict], n: int, path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt

    ink, muted, grid = "#0b0b0b", "#52514e", "#e4e3df"
    c_temp, c_wb, c_miss = "#eb6834", "#2a78d6", "#e34948"
    plt.rcParams.update({"font.size": 17, "font.family": "DejaVu Sans"})
    days = [date.fromisoformat(r["date"]) for r in rows]
    temps = [r["max_temp_c"] for r in rows]
    wbs = [r["max_wet_bulb_c"] for r in rows]

    fig, ax = plt.subplots(figsize=(16, 9), dpi=120)
    fig.patch.set_facecolor("#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    for r, d in zip(rows, days):
        if r["missed"]:
            ax.axvspan(mdates.date2num(d) - 0.5, mdates.date2num(d) + 0.5, color=c_miss, alpha=0.16, lw=0)
    ax.axhline(DRY_RULE_C, color=c_temp, lw=1.5, ls=(0, (6, 4)))
    ax.axhline(WB_RULE_C, color=c_wb, lw=1.5, ls=(0, (6, 4)))
    ax.plot(days, temps, color=c_temp, lw=2.5, label="Daily max temperature (06:00-19:59)")
    ax.plot(days, wbs, color=c_wb, lw=2.5, label="Daily max wet-bulb (06:00-19:59)")
    miss_d = [d for r, d in zip(rows, days) if r["missed"]]
    miss_wb = [r["max_wet_bulb_c"] for r in rows if r["missed"]]
    ax.scatter(miss_d, miss_wb, s=70, color=c_miss, edgecolor="#fcfcfb", linewidth=2, zorder=5,
               label="Missed: wet-bulb >= 28 C but temperature < 40 C")
    x0 = days[1]
    ax.text(x0, DRY_RULE_C + 0.4, "40 C heatwave rule", ha="left", va="bottom", color=ink, fontsize=15)
    ax.text(date(2026, 5, 6), WB_RULE_C - 0.4, "28 C wet-bulb (JalTaap ORANGE)", ha="left", va="top", color=ink, fontsize=15)
    ax.set_ylabel("°C", color=muted)
    ax.set_xlim(days[0], days[-1])
    lo = min(min(wbs), WB_RULE_C) - 3
    hi = max(max(temps), DRY_RULE_C) + 3
    ax.set_ylim(lo, hi)
    ax.xaxis.set_major_locator(mdates.MonthLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%-d %b"))
    ax.xaxis.set_minor_locator(mdates.WeekdayLocator(byweekday=0))
    ax.grid(axis="y", color=grid, lw=1)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    for side in ("left", "bottom"):
        ax.spines[side].set_color(grid)
    ax.tick_params(colors=muted)
    ax.legend(loc="lower left", bbox_to_anchor=(0.0, 1.0), ncol=3, frameon=False, fontsize=14,
              handlelength=1.6, columnspacing=1.6, borderaxespad=0.3)
    fig.text(0.06, 0.955, HEADLINE.format(n=n), ha="left", va="top", fontsize=23, color=ink, weight="bold")
    fig.text(0.06, 0.895, "Safdarjung, Delhi. 1 April to 31 July 2026. Daytime hours 06:00-19:59 IST.",
             ha="left", va="top", fontsize=17, color=muted)
    fig.text(0.06, 0.025, CAPTION, ha="left", fontsize=14, color=muted)
    fig.subplots_adjust(left=0.06, right=0.97, top=0.80, bottom=0.11)
    fig.savefig(path, facecolor=fig.get_facecolor())
    plt.close(fig)


def main() -> None:
    args = parse_args(__doc__.splitlines()[0])
    pts = points()
    data = archive(pts, START, END, args.refresh)
    all_rows, per_point = [], []
    for pt, h in zip(pts, data):
        rows = daily_rows(pt, h)
        all_rows.extend(rows)
        per_point.append(summarise(pt, h, rows))

    OUT.mkdir(parents=True, exist_ok=True)
    csv_path = OUT / "heat_2026.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(all_rows[0].keys()))
        w.writeheader()
        w.writerows(all_rows)

    saf_rows = [r for r in all_rows if r["point_id"] == SAFDARJUNG["id"]]
    saf = per_point[0]
    n = saf["missed_days"]
    humid = [r for r in saf_rows if r["max_temp_c"] < DRY_RULE_C and r["full_day_max_temp_c"] < DRY_RULE_C]
    # Highest max wet-bulb (API, 0.1 C resolution); ties broken by the Stull value, then lower temperature.
    humid_day = max(humid, key=lambda r: (r["max_wet_bulb_c"], r["max_wet_bulb_stull_c"], -r["max_temp_c"]))
    humid_ties = [r["date"] for r in humid if r["max_wet_bulb_c"] == humid_day["max_wet_bulb_c"]]

    summary = {
        "backtest": "A: humid heat a 40 C rule misses",
        "data": SOURCE,
        "label": "modelled data",
        "period": {"start": START, "end": END, "timezone": "Asia/Kolkata"},
        "day_window": "06:00-19:59 IST (hours starting 06:00 to 19:00; risk.yaml day_band_window, same as the engine's day band)",
        "definitions": {
            "dry_rule_days": "max temperature in the day window >= 40 C",
            "jaltaap_orange_plus_days": "JalTaap base (un-escalated) day band ORANGE or RED (wet-bulb >= 28 C or temperature >= 40 C in any window hour)",
            "missed_days": "max wet-bulb in the day window >= 28 C AND max temperature in the day window < 40 C",
            "wet_bulb": "Open-Meteo wet_bulb_temperature_2m; Stull (2011) used only where missing. *_stull_check fields recompute with Stull for every hour.",
        },
        "points": per_point,
        "headline": {
            "point": "Safdarjung (28.58, 77.21)",
            "n": n,
            "sentence": HEADLINE.format(n=n),
            "dates": saf["missed_dates"],
            "qualifier": "Modelled data (Open-Meteo reanalysis grid point near Safdarjung), 1 Apr to 31 Jul 2026, daytime 06:00-19:59 IST.",
        },
        "humid_heat_date": humid_day["date"],
        "humid_heat_day": {k: humid_day[k] for k in ("date", "max_temp_c", "full_day_max_temp_c", "max_wet_bulb_c",
                                                     "max_wet_bulb_stull_c", "day_band")},
        "humid_heat_rule": "Safdarjung day (Apr-Jul 2026) with the highest max wet-bulb while max temperature stayed under 40 C all day; ties broken by Stull wet-bulb, then lower temperature",
        "humid_heat_tied_dates": humid_ties,
        "caveats": [
            "Modelled data: Open-Meteo Historical Weather API is reanalysis on a ~9-25 km grid, not station readings; IMD Safdarjung observations will differ.",
            "The 40 C rule here is a simplified dry-bulb rule (daily max >= 40 C), not IMD's full heatwave criteria (which also use departure from normal).",
            "Wet-bulb >= 28 C is JalTaap's ORANGE threshold from risk.yaml, a starting value, not a physiological limit.",
        ],
    }
    write_json(OUT / "heat_2026_summary.json", summary)
    chart(saf_rows, n, OUT / "heat_2026.png")

    for p in per_point:
        print(f"{p['id']:12s} days={p['days']} dry40={p['dry_rule_days']} orange+={p['jaltaap_orange_plus_days']} "
              f"missed={p['missed_days']} (stull {p['missed_days_stull_check']}) maxT={p['max_temp_c']}@{p['max_temp_date']} "
              f"maxWB={p['max_wet_bulb_c']}@{p['max_wet_bulb_date']} grid=({p['model_grid_lat']},{p['model_grid_lon']})")
    print(summary["headline"]["sentence"])
    print("humid_heat_date:", summary["humid_heat_day"])
    print("wrote", rel(csv_path), rel(OUT / "heat_2026_summary.json"), rel(OUT / "heat_2026.png"))


if __name__ == "__main__":
    main()
