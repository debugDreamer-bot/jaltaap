# JalTaap web

Public risk map, "Try JalTaap" web chat, `/about` page and the officer view for JalTaap.
React + Vite + TypeScript, MapLibre GL JS, Tailwind CSS, i18next (Hindi and English) and
aws-amplify (Auth only, officer route only). Built strictly against
[`docs/api-contract.md`](../docs/api-contract.md).

## Run

```bash
cd web
npm ci
cp .env.example .env.local      # then fill in values
npm run dev                     # http://localhost:5173
npm run build                   # type-check + production build into dist/
npm run lint                    # ESLint (flat config)
npm run typecheck               # tsc only
```

Mock mode (local development only, no backend needed):

```bash
VITE_USE_MOCK=true npm run dev -- --port 5173
```

Mock mode serves the fixtures in `src/mocks/` and shows a striped
"MOCK DATA — development only" banner on every page (and inside the chat drawer). It is only on
when `VITE_USE_MOCK` is exactly `true`; the check is inlined at build time, so a production
build without that variable contains no mock code or fixtures. In mock mode any username and
password signs in to `/officer` as a PWD officer. Chat messages containing `mock-error` or
`mock-429` exercise the error and rate-limit paths.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | yes | API Gateway base URL, no trailing slash. Without it the pages say data is unavailable. |
| `VITE_MAP_KEY` | no | Amazon Location Service API key. Unset: OpenFreeMap is used. |
| `VITE_AWS_REGION` | no | Region for Amazon Location and Cognito. Default `ap-south-1`. |
| `VITE_COGNITO_USER_POOL_ID` | officer view | Cognito user pool for officers. |
| `VITE_COGNITO_CLIENT_ID` | officer view | Cognito app client (no secret). |
| `VITE_REPO_URL` | no | Repo link on `/about`. Hidden when unset. |
| `VITE_VIDEO_URL` | no | Demo video link on `/about`. Hidden when unset. |
| `VITE_USE_MOCK` | dev only | `true` turns on mock mode. Never set it in Amplify. |

Map style: with `VITE_MAP_KEY` the map uses
`https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=…&color-scheme=Light`
and falls back to OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) if that style
fails to load. The Amazon key must allow the `maps` resource for this site's referer.

## Amplify Hosting

- App root: `web`
- Build command: `npm ci && npm run build`
- Output (artifacts) directory: `dist`
- Environment variables: as in the table above (not `VITE_USE_MOCK`).
- SPA rewrite (Rewrites and redirects, type **200 (Rewrite)**):

  | Source | Target | Type |
  | --- | --- | --- |
  | `</^[^.]+$\|\.(?!(css\|gif\|ico\|jpg\|js\|png\|txt\|svg\|woff\|woff2\|ttf\|map\|json\|webp)$)([^.]+$)/>` | `/index.html` | 200 |

  (Without the table escaping: `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>`.)
  MapLibre's worker ships as `.mjs`, which that rule would rewrite to `index.html`.
  `vite.config.ts` therefore emits it as `assets/maplibre-gl-worker-*.js`, so the standard
  rule above works unchanged.

## Pages

- `/` full-screen map. Layers: Heat (36 squares, band colour at 0.45 opacity plus a band icon
  at each centre), Waterlogging (circles sized by risk, coloured by level, level icon inside,
  underpass badge), Reports (pins, faded after 3 h unless `confirmed`), Relief (cooling, water,
  hospital icons). Time slider over `hours_available` (GET /risk/heat?time= and
  GET /risk/flood?time= for the same hour). Replay picker from GET /replay with play/pause and
  scrubbing; the replay `label` stays visible as a banner. Legend, "Data updated" times, and the
  "Try JalTaap" chat drawer (lazy chunk).
- `/about` the problem in three cited numbers, how risk is computed, data sources and licences,
  limitations, team, optional repo/video links, and backtest results read from
  `public/backtests.json` when present (shape below). Nothing is shown for it otherwise.
- `/officer` lazy chunk with aws-amplify. Cognito sign-in (handles the new-password challenge),
  agency from the ID token claim `custom:agency`, report queue (GET /officer/reports) with photo,
  depth, time and a small map, Confirmed / Resolved / False (PATCH /reports/{id}), and the
  action brief (GET /briefs/{agency}). API calls send `Authorization: Bearer <Cognito ID token>`.

`public/backtests.json` (optional):

```json
{"heat_missed_days": 2, "heat_missed_sentence": "…", "chart": "/backtest_heat_2026.png"}
```

Any field may be `null`. If the file is missing or every field is null, the section is hidden.

## Design rules followed

- Colour never carries meaning alone: every band and level is shown with a colour, an icon and a
  word (legend, popups, chips, `/about`). Palette lives in `src/theme.ts`; icons in
  `src/lib/icons.ts` are shared by the map images, legend and popups. All swatch/icon pairs and
  text colours meet WCAG AA (4.5:1 or better).
- Text is 16 px minimum everywhere, including map popups and attribution.
- Works at 360 px: no horizontal scroll, controls sit below the map on phones and in a sidebar
  on desktop. Touch targets are at least 44 px.
- Attribution is always visible below the map: "Weather data by Open-Meteo.com", the map
  provider (read from the style), and OpenStreetMap.
- Honesty: every number, band, level and time on screen comes from an API response. Empty and
  error states say the data is unavailable; nothing is filled in.
- Server text is rendered as React text (escaped). Links in chat replies are auto-linked
  (http/https only). Map popups are built with DOM APIs and `textContent`.

## Translations

All strings are in `src/i18n/en.json` and `src/i18n/hi.json`. The language defaults to the
browser language (Hindi if `hi*`, else English) and the header button switches it; the choice
is remembered in localStorage. Hindi uses Noto Sans Devanagari from Google Fonts.

**The Hindi strings were machine-drafted and need review by a native speaker before launch.**

## Bundle

Pages are split: the entry chunk holds React, i18next and the app shell; MapLibre is loaded
with the map page; `aws-amplify` is only in the officer chunk. Sizes at the time of writing
(gzip): entry JS about 91 KB, map page 8.5 KB, MapLibre 286 KB plus its worker 144 KB (map page
only), chat drawer 3.7 KB, `/about` 2 KB, officer page with aws-amplify 41 KB. Run
`npm run build` for current numbers.

## Dependencies and licences

| Package | Licence |
| --- | --- |
| react, react-dom | MIT |
| maplibre-gl | BSD-3-Clause |
| i18next, react-i18next | MIT |
| aws-amplify | Apache-2.0 |
| vite, @vitejs/plugin-react | MIT |
| tailwindcss, @tailwindcss/vite | MIT |
| typescript | Apache-2.0 |
| eslint, typescript-eslint, eslint-plugin-react-hooks, eslint-plugin-react-refresh, @eslint/js, globals | MIT |

Data and services: Open-Meteo (CC BY 4.0), OpenStreetMap data (ODbL), OpenFreeMap / OpenMapTiles
or Amazon Location Service for map tiles, Noto Sans Devanagari (SIL Open Font License 1.1).
