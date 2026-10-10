"""Backtest D: humid heat that a 40 C rule misses, across every covered city (pan-India).

Same method as Backtest A (heat_2026.py), one point per city (the geocoded city centre in
data/cities.json), 1 April to 31 July 2026, day window 06:00-19:59 IST (risk.yaml day_band_window).
For each city and day, the JalTaap base (un-escalated) day band is ORANGE or worse exactly when the
day's max wet-bulb >= 28 C or max temperature >= 40 C, so the dangerous days split cleanly into:
  dry_rule_days      max temperature >= 40 C (a 40 C heatwave rule also flags the day)
  humid_only_days    max temperature < 40 C but max wet-bulb >= 28 C (only humidity flags it)

Modelled data: Open-Meteo Historical Weather API (reanalysis), not station readings. A city-centre
point stands in for the whole city.

Run:  .venv/bin/python backtests/heat_cities_2026.py [--refresh]
"""
from __future__ import annotations

import csv
import json

from _common import CAPTION, DATA, OUT, SOURCE, archive, parse_args, rel, write_json

from risk.config_loader import heat_config
from risk.heat import HourInput, band_index, day_band_from_hours
from risk.wetbulb import wet_bulb_or_compute

START, END = "2026-04-01", "2026-07-31"
DRY_RULE_C = 40.0
TOP = 20
WB_RULE_C = 28.0


def cities() -> list[dict]:
    return json.loads((DATA / "cities.json").read_text(encoding="utf-8"))


def city_days(h: dict) -> list[dict]:
    cfg = heat_config()
    s, e = int(cfg["day_band_window"]["from"][:2]), int(cfg["day_band_window"]["to"][:2])
    by_day: dict[str, list[HourInput]] = {}
    for i, t in enumerate(h["time"]):
        temp, rh = h["temperature_2m"][i], h["relative_humidity_2m"][i]
        if temp is None or rh is None:
            continue
        by_day.setdefault(t[:10], []).append(HourInput(t, temp, rh, h["wet_bulb_temperature_2m"][i]))
    rows = []
    for d, hours in sorted(by_day.items()):
        win = [x for x in hours if s <= int(x.time[11:13]) < e]
        if not win:
            continue
        max_t = max(x.temp_c for x in win)
        max_wb = max(wet_bulb_or_compute(x.wet_bulb_c, x.temp_c, x.rh) for x in win)
        band = day_band_from_hours(hours, cfg)
        rows.append({"date": d, "max_temp_c": round(max_t, 1), "max_wet_bulb_c": round(max_wb, 1), "day_band": band,
                     "orange_plus": band_index(band) >= band_index("ORANGE"),
                     "dry_rule": max_t >= DRY_RULE_C, "humid_only": max_t < DRY_RULE_C and max_wb >= WB_RULE_C})
    return rows


def chart(summary: list[dict], path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ink, muted, grid, surface = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
    c_dry, c_humid = "#eb6834", "#2a78d6"           # reference palette slots 2 and 1 (validated pair)
    # the TOP cities with the most humid-only days (63 bars would not read); the headline counts all cities
    top = sorted(summary, key=lambda r: (r["humid_only_days"], r["orange_plus_days"]), reverse=True)[:TOP]
    rows = sorted(top, key=lambda r: (r["humid_only_days"], r["orange_plus_days"]))
    names = [r["name"] for r in rows]
    dry = [r["dry_rule_days"] for r in rows]
    humid = [r["humid_only_days"] for r in rows]
    total_humid = sum(r["humid_only_days"] for r in summary)

    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 15})
    fig, ax = plt.subplots(figsize=(16, 11), dpi=120)
    fig.subplots_adjust(left=0.17, right=0.95, top=0.82, bottom=0.10)
    fig.patch.set_facecolor(surface)
    ax.set_facecolor(surface)
    y = range(len(rows))
    h = 0.62
    ax.barh(y, dry, height=h, color=c_dry, edgecolor=surface, linewidth=2, label="40 °C rule also flags the day")
    ax.barh(y, humid, left=dry, height=h, color=c_humid, edgecolor=surface, linewidth=2,
            label="Only humidity flags it (wet-bulb ≥ 28 °C, below 40 °C)")
    for i, r in enumerate(rows):
        end = r["dry_rule_days"] + r["humid_only_days"]
        txt = f"{r['humid_only_days']} humid-only" if r["humid_only_days"] else "0 humid-only"
        ax.text(end + 1.2, i, f"{end} day{'' if end == 1 else 's'}  ·  {txt}", va="center", ha="left", color=ink, fontsize=14)
    ax.set_yticks(list(y), names, color=ink)
    ax.set_xlabel("Days at JalTaap ORANGE or worse, 1 April to 31 July 2026", color=muted)
    ax.set_xlim(0, max(d + m for d, m in zip(dry, humid)) * 1.32 + 1)
    ax.grid(axis="x", color=grid, lw=1)
    ax.set_axisbelow(True)
    for side in ("top", "right", "left"):
        ax.spines[side].set_visible(False)
    ax.spines["bottom"].set_color(grid)
    ax.tick_params(colors=muted, length=0)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.0), ncol=2, frameon=False, fontsize=14, labelcolor=ink)
    fig.text(0.04, 0.955, f"Across {len(summary)} Indian cities, {total_humid} city-days in 2026 were dangerous by humidity alone",
             ha="left", va="top", fontsize=23, color=ink, weight="bold")
    top = max(summary, key=lambda r: r["humid_only_days"])
    caught = "none" if top["dry_rule_days"] == 0 else f"only {top['dry_rule_days']}"
    fig.text(0.04, 0.905, f"A 40 °C heatwave rule never flags the blue days. {top['name']} had "
             f"{top['orange_plus_days']} dangerous days and the 40 °C rule caught {caught} of them.",
             ha="left", va="top", fontsize=17, color=muted)
    fig.text(0.04, 0.025, CAPTION + f". One point per city, 06:00-19:59 IST. Top {len(rows)} of {len(summary)} cities.", ha="left",
             fontsize=13, color=muted)
    fig.savefig(path, facecolor=surface)
    plt.close(fig)


def main() -> None:
    args = parse_args(__doc__.splitlines()[0])
    cs = cities()
    series = archive([{"lat": c["lat"], "lon": c["lon"]} for c in cs], START, END, refresh=args.refresh)
    detail, summary = [], []
    for c, h in zip(cs, series):
        days = city_days(h)
        for d in days:
            detail.append({"city": c["id"], **d})
        summary.append({
            "city": c["id"], "name": c["name"], "lat": c["lat"], "lon": c["lon"], "days": len(days),
            "orange_plus_days": sum(d["orange_plus"] for d in days),
            "dry_rule_days": sum(d["dry_rule"] for d in days),
            "humid_only_days": sum(d["humid_only"] for d in days),
            "max_temp_c": max(d["max_temp_c"] for d in days),
            "max_wet_bulb_c": max(d["max_wet_bulb_c"] for d in days),
        })
        # the two parts partition the ORANGE-or-worse days (base band = wet-bulb OR temperature rule)
        assert summary[-1]["orange_plus_days"] == summary[-1]["dry_rule_days"] + summary[-1]["humid_only_days"]
    csv_path = OUT / "heat_cities_2026.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=list(detail[0]))
        w.writeheader()
        w.writerows(detail)
    total = sum(s["humid_only_days"] for s in summary)
    headline = (f"{total} city-days across {len(cs)} Indian cities in 2026 were dangerous by humidity but never met "
                f"a 40 C heatwave rule.")
    write_json(OUT / "heat_cities_2026_summary.json", {"source": SOURCE, "period": [START, END],
                                                       "headline": headline, "cities": summary})
    png = OUT / "heat_cities_2026.png"
    chart(summary, png)
    for s in sorted(summary, key=lambda s: -s["humid_only_days"]):
        print(f"{s['name']:<10} ORANGE+ {s['orange_plus_days']:>3}  dry {s['dry_rule_days']:>3}  "
              f"humid-only {s['humid_only_days']:>3}  max T {s['max_temp_c']}  max WB {s['max_wet_bulb_c']}")
    print(headline)
    print("wrote", rel(csv_path), rel(png))


if __name__ == "__main__":
    main()
