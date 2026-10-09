# JalTaap backtests and replays

All numbers here are **modelled data**: Open-Meteo Historical Weather API (reanalysis on a
~9-25 km grid) and Open-Meteo Previous Runs API (archived forecasts). They are not IMD station
or rain-gauge readings. Thresholds come from `backend/risk/config/risk.yaml` and were not tuned
to these results.

## How to run

From the repo root, in this order (B and the replays read A's outputs):

```sh
.venv/bin/python data/build_grid.py              # data/grid.json
.venv/bin/python data/geocode_hotspots.py        # data/hotspots.json, relief_points.json, GEOCODING_REVIEW.md
.venv/bin/python backtests/heat_2026.py          # A
.venv/bin/python backtests/heat_dayahead_2026.py # B
.venv/bin/python backtests/flood_2026_07_09.py   # C
.venv/bin/python backtests/build_replays.py      # D
```

Every HTTP response is cached under `backtests/.cache/` (gitignored), so reruns make no network
calls and give identical outputs. Add `--refresh` to any script to bypass the cache.
`backtests/_common.py` holds the shared cached Open-Meteo client.

## A. Humid heat a 40 C rule misses (`heat_2026.py`)

Points: Safdarjung (28.58, 77.21) and the grid cells g_28.8_77.0 (north-west), g_28.6_77.3
(east), g_28.5_77.2 (south). Period 1 April to 31 July 2026. Each day uses the engine's day
window, **06:00-19:59 IST** (`day_band_window` in risk.yaml, the same hours that make the JalTaap
day band). Wet-bulb is Open-Meteo's `wet_bulb_temperature_2m` (Stull 2011 only where missing; a
Stull-only recount gives the same numbers).

- `outputs/heat_2026.csv`: one row per point per day (max temperature, max wet-bulb, Stull
  wet-bulb, base day band, and the dry-rule / ORANGE+ / missed flags).
- `outputs/heat_2026_summary.json`: counts per point, the headline, the missed dates, the
  humid-heat day.
- `outputs/heat_2026.png`: Safdarjung daily max temperature and wet-bulb with the 40 C and 28 C
  wet-bulb lines, missed days shaded.

| point | days | max temp >= 40 C | JalTaap ORANGE+ | missed (wet-bulb >= 28, temp < 40) |
|---|---|---|---|---|
| Safdarjung | 122 | 32 | 43 | **11** |
| g_28.8_77.0 (north-west) | 122 | 19 | 38 | 19 |
| g_28.6_77.3 (east) | 122 | 32 | 43 | 11 |
| g_28.5_77.2 (south) | 122 | 27 | 37 | 10 |

**Headline (Safdarjung, modelled data): "11 days in 2026 were dangerous by humidity but never
met a 40 C heatwave rule."** Dates: 4, 5, 6, 7, 11, 12, 13, 19, 26, 27 and 29 July 2026.

**Humid-heat day: 2026-07-13** (max wet-bulb 28.9 C, max temperature 35.8 C, band ORANGE).
6 July ties on wet-bulb (28.9 C at 36.7 C); 13 July wins the tie-break on Stull wet-bulb
(29.0 C vs 28.9 C).

The model peaks at 44.4 C at Safdarjung on 19 May. On 22 May it gives 42.0 C at Safdarjung
and at most 42.7 C in any of the 36 cells, below the 44-46 C in news reports for that day.
The model grid smooths out local extremes; we report this rather than change thresholds.

Caveats: the "40 C rule" is a simple dry-bulb cut-off, not IMD's full heatwave criteria;
28 C wet-bulb is JalTaap's starting ORANGE threshold, not a physiological limit.

## B. Day-ahead skill (`heat_dayahead_2026.py`)

Predicted: Previous Runs `temperature_2m_previous_day1` and `relative_humidity_2m_previous_day1`
(the forecast for each hour from the run about one day earlier) at Safdarjung, wet-bulb by Stull,
base day band. Observed: the archive day band from A. Event: day band ORANGE or worse.

- `outputs/heat_dayahead_2026.csv`: per day, predicted and observed max temp, wet-bulb, band.
- `outputs/heat_dayahead_2026_summary.json`: the scores below, plus a repeat with Stull on both sides.

| | value |
|---|---|
| hit rate (predicted ORANGE+ given observed ORANGE+) | **35/43 = 0.814** |
| false-alarm ratio (predicted ORANGE+ but observed below) | **9/44 = 0.2045** |
| misses / correct negatives | 8 / 70 |
| exact band agreement | 96/122 days |
| A's 11 humid days caught a day ahead | 8/11 (missed 7, 19 and 29 July) |

Caveat: **both sides are modelled.** For every one of the 122 days, the archive's daily max
temperature equals the Previous Runs API's own day-0 value, so "observed" is effectively the
model's own analysis. This measures how well a one-day-old forecast anticipates the model, not
real-world skill. One grid point and 122 days: small counts, wide uncertainty.

## C. The 9 July 2026 storm (`flood_2026_07_09.py`)

The 23 geocoded hotspots are snapped to grid cells and scored every hour from 8 Jul 00:00 to
9 Jul 23:00 IST with `score_hotspot` + `rain_windows`, using archive rain as a perfect forecast
(7 Jul gives the 24 h antecedent). Old Rajinder Nagar has no coordinates and is skipped.

- `outputs/flood_2026_07_09.csv`: one row per hotspot per hour (level, risk, 1 h / 3 h / 24 h rain).
- `outputs/flood_2026_07_09_summary.json`: ranking, comparison with reports, leakage check, rain per cell.

Peak levels: SEVERE 1 (Pul Prahladpur), HIGH 7, MEDIUM 13, LOW 2. The first HIGH+ was 9 Jul
04:00 (Pul Prahladpur), and most HIGH spots reached it at 07:00. Model rain peaked between
05:00 and 09:00 on 9 Jul, depending on the cell.

Comparison with the places in reports (hotspots whose `years` include 2026):

| group | with coords | in top 20 | reached HIGH+ |
|---|---|---|---|
| waterlogging, 2026 | 7 | 7 | 3 (Azadpur, Zakhira, Minto Bridge) |
| traffic disruption, 2026 | 9 | 6 | 2 (DND link, Mathura Road near Ashram) |
| not reported in 2026 | 7 | 7 | 3 (Pul Prahladpur, Loni Road, Vinod Nagar) |

- With only 23 scored spots, the top 20 includes almost the whole list, so the top-20
  overlap shows nothing on its own. The share that reached HIGH+ is no higher for spots
  reported in 2026 (5/16) than for spots not reported in 2026 (3/7). On this one storm the
  model **does not separate** reported from unreported spots.
- Leakage: `years_seen` counts 2026, and the 2026 entries come from this season's reports. If
  2026 is left out of `years_seen`, only 1 reported waterlogging spot (Azadpur) and 2 traffic
  spots reach HIGH+.
- Lead time **cannot be measured**: the reports have no timestamps. The summary gives each
  spot's first HIGH+ time and peak-rain hour. No report time has been assumed.
- Rain context: the model gives more than 100 mm on 9 Jul in 10 of 36 cells, mostly in the
  east and north-east. The wettest is g_28.9_77.3 with 265.1 mm. Central g_28.6_77.2, which
  holds 12 of the hotspots, gets 99.8 mm. So the model does show ">100 mm in parts of Delhi".
  The highest 1-hour rain in any cell is 52.4 mm.
- Caveats: reports describe traffic disruption and waterlogging, not measured depth. Grid rain
  is a ~10-25 km average, and spots in the same cell share one rain series. Hotspot coordinates
  are unverified (`needs_check=true`).

## D. Replays (`build_replays.py`)

`outputs/replays/` follows `docs/api-contract.md` (`GET /replay/{scenario}`): all 36 cells every
hour with the base hourly band, and every geocoded hotspot with its flood level. Each file
includes the 24 h before the window as the flood antecedent.

| file | hours | size (gzip) |
|---|---|---|
| `heat-2026-05-22.json` | 18 May 00:00 to 25 May 23:00 (192) | 813 KB (52 KB) |
| `flood-2026-07-09.json` | 8 Jul 00:00 to 10 Jul 00:00 (49) | 216 KB (16 KB) |
| `humid-heat-2026-07-13.json` | 13 Jul 00:00 to 23:00 (24) | 107 KB (8 KB) |
| `index.json` | scenario list | <1 KB |

The heat replay has RED cell-hours only on 19 May (28) and 20 May (2); on 22 May the model reaches ORANGE but not
RED. The humid-heat replay peaks at 29.8 C wet-bulb in one cell (ORANGE, just below RED at 30).
