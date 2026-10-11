# JalTaap HTTP API contract

One API Gateway HTTP API (ap-south-1). All bodies are JSON, all times are ISO 8601 in IST
(`+05:30`). Every number shown to a user must come from one of these responses and be shown
with its `data_updated_at` (spec rule 4).

Base URL: `VITE_API_URL` in the web app, for example
`https://abc123.execute-api.ap-south-1.amazonaws.com`.

## Public (no auth)

### `GET /health`
```json
{"status": "ok", "version": "0.1.0", "time": "2026-10-09T17:30:00+05:30"}
```

### `GET /cities`
Covered cities (pan-India). Delhi has `tier: "full"` (hotspots, replays); the other ten have
`tier: "heat_and_rain"`. `bounds` is the city grid's `[west, south, east, north]`.
```json
{"cities": [{"id": "mumbai", "name": "Mumbai", "name_hi": "मुंबई", "state": "Maharashtra",
             "lat": 19.0728, "lon": 72.8826, "tier": "heat_and_rain",
             "agencies": {"civic": "BMC", "water": "BMC"},
             "agency_names": {"BMC": "Brihanmumbai Municipal Corporation (Hydraulic Engineer)"},
             "bounds": [72.75, 18.95, 73.05, 19.25]}],
 "india_bbox": {"min_lat": 6.5, "max_lat": 37.1, "min_lon": 68.1, "max_lon": 97.4}}
```

### `GET /risk/heat?time=<iso hour>&city=<id>`
`time` is optional; default is the current hour. Valid values are listed in `hours_available`
(now to +48 h). `city` is optional; without it every covered city's cells are returned (126).
An unknown city is a 400.
```json
{
  "time": "2026-10-09T17:00:00+05:30",
  "source": "open-meteo",
  "data_updated_at": "2026-10-09T17:05:00+05:30",
  "hours_available": ["2026-10-09T17:00:00+05:30", "..."],
  "cells": [
    {"id": "g_28.6_77.2", "city": "delhi", "lat": 28.6, "lon": 77.2, "bounds": [77.15, 28.55, 77.25, 28.65],
     "band": "ORANGE", "temp_c": 38.2, "rh": 52, "wet_bulb_c": 28.4,
     "rain_next_3h_mm": 0.0, "area_flood_level": "LOW"}
  ]
}
```
`bounds` is `[west, south, east, north]`. Delhi has 36 cells, every other city 9. `band` is GREEN,
YELLOW, ORANGE or RED. `area_flood_level` is the general rain-driven waterlogging level for a
street with no listed hotspot (LOW to HIGH, never SEVERE).

### `GET /risk/flood?time=<iso hour>`
```json
{
  "time": "2026-07-09T06:00:00+05:30",
  "horizon_h": 3,
  "source": "open-meteo",
  "data_updated_at": "2026-07-09T05:05:00+05:30",
  "hotspots": [
    {"id": "hs_zakhira", "name": "Zakhira flyover and underpass", "type": "underpass", "agency": "PWD",
     "lat": 28.6611, "lon": 77.1500, "level": "HIGH", "risk": 0.62,
     "rain_next_1h_mm": 22.0, "rain_next_3h_mm": 41.5, "confirmed_reports": 0}
  ]
}
```
`level` is LOW, MEDIUM, HIGH, SEVERE or CONFIRMED (a verified photo within 300 m in 2 h).

### `GET /relief`
```json
{"points": [{"id": "rp_jama_masjid_cz", "name": "Cooling zone near Jama Masjid", "kind": "cooling",
             "status": "seasonal", "lat": 28.65, "lon": 77.23, "cool_room": "yes", "source": "https://..."}]}
```
`kind` is cooling, water or hospital.

### `GET /reports?since=<iso>&status=verified`
Public pins. No user data, ever.
```json
{"reports": [{"id": "01J...", "lat": 28.66, "lon": 77.15, "thumb_url": "https://presigned...",
              "hazard_type": "waterlogging", "water_depth": "knee", "severity": 3,
              "summary_en": "...", "summary_hi": "...", "status": "verified", "agency": "PWD",
              "hotspot_id": "hs_zakhira", "created_at": "2026-07-09T06:20:00+05:30"}]}
```

### `GET /replay` and `GET /replay/{scenario}`
`GET /replay` lists scenarios: `{"scenarios": [{"id": "heat-2026-05-22", "label": "...", "kind": "heat"}]}`.

`GET /replay/{scenario}` returns the precomputed file from S3:
```json
{
  "scenario": "flood-2026-07-09",
  "label": "Replay: modelled data for 9 July 2026",
  "source": "Open-Meteo Historical Weather API (modelled reanalysis, not station readings)",
  "cells": [{"id": "g_28.6_77.2", "lat": 28.6, "lon": 77.2, "bounds": [77.15, 28.55, 77.25, 28.65]}],
  "hotspots": [{"id": "hs_zakhira", "name": "...", "type": "underpass", "agency": "PWD", "lat": 28.66, "lon": 77.15}],
  "hours": [
    {"time": "2026-07-09T06:00:00+05:30",
     "heat": {"g_28.6_77.2": {"band": "GREEN", "temp_c": 29.1, "rh": 88, "wet_bulb_c": 27.6}},
     "flood": {"hs_zakhira": {"level": "HIGH", "risk": 0.62, "rain_1h_mm": 22.0, "rain_3h_mm": 41.5}}}
  ]
}
```
Scenarios: `heat-2026-05-22`, `flood-2026-07-09`, `humid-heat-<yyyy-mm-dd>`.

### `GET /now?lat=&lon=&label=&profile=`
One screen of answers for any point in India (backs the worker view, dashboards and live safety).
Rate-limited per IP. 503 if the forecast is unavailable. `profile` is an optional comma-separated
list of `heavy_work`, `age_60_plus`, `pregnant`, `chronic_illness`, `not_acclimatised` (unknown
flags are ignored); it raises today's bands by at most one (GREEN stays GREEN) and personalises
`warnings`.
```json
{"location": {"lat": 22.57, "lon": 88.36, "label": "Kolkata", "city": "Kolkata", "city_id": "kolkata", "coverage": "heat_and_rain"},
 "now": {"time": "2026-10-09T21:00:00+05:30", "band": "GREEN", "temp_c": 28.1, "rh": 76, "wet_bulb_c": 24.0,
         "rain_next_3h_mm": 0.0, "area_flood_level": "LOW", "uv_index": 0.0},
 "today": {"date": "2026-10-09", "day_band": "YELLOW", "blocks": [...], "heavy_work_windows": [...],
           "avoid_windows": [...], "noon_pause": null, "peak_hour": {...}, "advice_keys": [...]},
 "air": {"aqi": 176, "category": "MODERATE", "dominant": "pm2_5", "estimate": true, "pm2_5": 83.4, "pm10": 92.0,
         "advice_keys": ["air_moderate"]},
 "uv": {"now": 0.0, "now_category": "LOW", "today_max": 4.6, "today_category": "MODERATE", "advice_keys": []},
 "hours": [{"time": "...", "band": "GREEN", "temp_c": 28.1, "rh": 76, "wet_bulb_c": 24.0, "rain_next_3h_mm": 0.0,
            "area_flood_level": "LOW", "uv_index": 0.0}],
 "warnings": [{"hazard": "heat", "severity": 3, "level": "RED", "at": "2026-10-10T12:00:00+05:30", "temp_c": 32.6,
               "wet_bulb_c": 28.1}],
 "source": "open-meteo", "data_updated_at": "..."}
```
`warnings` covers the next 3 hours, most severe first (`risk/warnings.py`). `hazard` is `heat`
(ORANGE 2, RED 3), `rain` (area level MEDIUM 1, HIGH 2, SEVERE 3; adds `rain_mm`), `air` (POOR 2,
VERY_POOR/SEVERE 3, MODERATE 1 for age 60+, pregnancy or chronic illness; adds `aqi`) or `uv`
(VERY_HIGH 1, EXTREME 2; adds `uv_index`). Severity 1 is an advisory; clients interrupt only for 2+.
`air` is an India AQI estimate from modelled PM2.5/PM10 (CPCB breakpoints); it and `uv` are null
when the air-quality API is unavailable.

### `GET /water-issues`
Water-access problems from the last 24 h that are corroborated (3 independent reporters in the
same ~1 km cell) or photo-verified, grouped by cell and issue. No user data, no notes.
```json
{"window_h": 24, "min_reporters": 3, "issues": [
  {"issue": "tanker_no_show", "lat": 28.5794, "lon": 77.0471, "reports": 4, "photo_verified": 0,
   "agency": "DJB", "latest": "2026-10-09T18:10:00+05:30", "status": "corroborated"}]}
```
`issue` is leak, tanker_no_show, no_supply or dirty_water.

### `GET /crew?lat=&lon=&size=&from=HH:MM&to=HH:MM&date=YYYY-MM-DD&heavy=1`
Crew heat schedule (risk/crew.py) for any point in India, today to 2 days ahead. Rate-limited per
IP. Returns the crew schedule: `blocks` and `hours` (band, activity heavy/light/rest, work and
rest minutes, `rotation` of staggered rest groups, water per worker), `water`
(`litres_per_worker`, `litres_total`, `glasses_per_worker`), `heavy_work_hours`, `noon_pause`,
`worst_band`, `ors_needed`, plus `city` and `coverage`.

## Session-scoped (random `session_id`, rate-limited per session and IP)

### `POST /chat`
Request: `{"session_id": "uuid", "message": "Najafgarh mein kaam kab karun?", "lat": 28.61, "lon": 76.98, "profile": ["heavy_work"]}`
(`lat`/`lon` and `profile` optional; `profile` takes the same flags as `/now`, kept on the user's
device and sent with each message). Response within 25 s:
```json
{"reply": "plain text with links", "data_updated_at": "2026-10-09T17:05:00+05:30"}
```
`data_updated_at` is null when the reply used no forecast data. 429 when rate-limited.

### `POST /reports/upload-url`
Request: `{"session_id": "uuid", "lat": 28.66, "lon": 77.15, "note": "optional text"}`.
Response: `{"report_id": "01J...", "upload_url": "https://...", "content_type": "image/jpeg", "expires_in": 900}`.
The browser then sends `PUT upload_url` with the JPEG body and `Content-Type: image/jpeg`.
Poll `GET /reports/{report_id}/status` → `{"status": "pending|verified|needs_review|rejected", "verdict": {...}|null}`.

## Officers (Cognito JWT; `officers` group with `custom:agency`, or `control_room` with `custom:city`)

Every officer action is a Cedar authorization request (backend/policies/reports.cedar): officers
see and act on their own agency's reports; only verified, confirmed or corroborated reports can be
resolved; resolved and false reports stay closed; control rooms read every report in their city
and change nothing. A refusal is a 403.

### `GET /officer/reports?status=<s>`
Reports the caller may view, newest first, including `needs_review`, `unverified` and
`corroborated`. Same shape as public reports plus `confidence`, `note`, `photo_url` (presigned,
15 min), `category` (flood or water), `issue`, `source` (photo or text), `corroborations` and
`reassigned_from`.

### `PATCH /reports/{id}`
Body `{"status": "confirmed" | "resolved" | "false"}` or, to hand the report to another agency,
`{"agency": "<code>", "note": "..."}` (exactly one of the two). Returns `{"report": {...}}`.

### `GET /officer/agencies`
`{"agencies": ["BMC", "BWSSB", "DJB", "MCD", "NDMC", "PWD", ...]}`: every code a report can be
handed to.

### `GET /briefs/{agency}`
```json
{"agency": "PWD", "generated_at": "...", "actions": [
  {"n": 1, "spot": "Zakhira flyover and underpass", "evidence": "3 verified reports, latest 06:20",
   "ask": "Send a pump; clear the drain inlet on the west lane", "report_ids": ["01J..."]}
]}
```

## Errors
`{"error": "message", "status": 400}` with the matching HTTP status.
