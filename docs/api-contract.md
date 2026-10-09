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

### `GET /risk/heat?time=<iso hour>`
`time` is optional; default is the current hour. Valid values are listed in `hours_available`
(now to +48 h).
```json
{
  "time": "2026-10-09T17:00:00+05:30",
  "source": "open-meteo",
  "data_updated_at": "2026-10-09T17:05:00+05:30",
  "hours_available": ["2026-10-09T17:00:00+05:30", "..."],
  "cells": [
    {"id": "g_28.6_77.2", "lat": 28.6, "lon": 77.2, "bounds": [77.15, 28.55, 77.25, 28.65],
     "band": "ORANGE", "temp_c": 38.2, "rh": 52, "wet_bulb_c": 28.4}
  ]
}
```
`bounds` is `[west, south, east, north]`. Always 36 cells. `band` is GREEN, YELLOW, ORANGE or RED.

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

## Session-scoped (random `session_id`, rate-limited per session and IP)

### `POST /chat`
Request: `{"session_id": "uuid", "message": "Najafgarh mein kaam kab karun?", "lat": 28.61, "lon": 76.98}`
(`lat`/`lon` optional). Response within 25 s:
```json
{"reply": "plain text with links", "data_updated_at": "2026-10-09T17:05:00+05:30"}
```
`data_updated_at` is null when the reply used no forecast data. 429 when rate-limited.

### `POST /reports/upload-url`
Request: `{"session_id": "uuid", "lat": 28.66, "lon": 77.15, "note": "optional text"}`.
Response: `{"report_id": "01J...", "upload_url": "https://...", "content_type": "image/jpeg", "expires_in": 900}`.
The browser then sends `PUT upload_url` with the JPEG body and `Content-Type: image/jpeg`.
Poll `GET /reports/{report_id}/status` → `{"status": "pending|verified|needs_review|rejected", "verdict": {...}|null}`.

## Officers (Cognito JWT, `officers` group; agency from the `custom:agency` attribute)

### `GET /officer/reports?status=<s>`
Reports for the caller's agency, newest first, including `needs_review`. Same shape as public
reports plus `confidence`, `note` and `photo_url` (presigned, 15 min).

### `PATCH /reports/{id}`
Body `{"status": "confirmed" | "resolved" | "false"}`. Returns the updated report. Only the
owning agency may change a report.

### `GET /briefs/{agency}`
```json
{"agency": "PWD", "generated_at": "...", "actions": [
  {"n": 1, "spot": "Zakhira flyover and underpass", "evidence": "3 verified reports, latest 06:20",
   "ask": "Send a pump; clear the drain inlet on the west lane", "report_ids": ["01J..."]}
]}
```

## Errors
`{"error": "message", "status": 400}` with the matching HTTP status.
