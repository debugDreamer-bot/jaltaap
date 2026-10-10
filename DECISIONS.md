# Decisions

Dated record of thresholds, trade-offs and choices made without asking the team
(spec rule: "pick the simpler option and note it in DECISIONS.md").

## 2026-10-09

- **Fresh repo, nothing reused.** The earlier HEATSHIELD prototype is not used as a base: the
  rules disqualify reused projects and require a history that matches the event dates.
- **Python import root is `backend/`.** SAM uses `CodeUri: backend/` with handlers such as
  `handlers.worker.handler`, so modules import as `common`, `risk`, `agent`, `handlers`
  (not `backend.common` as in the spec's sketch). Tests run with `backend/` on `sys.path`.
- **Escalation skips GREEN hours.** Environment and profile escalation raise YELLOW, ORANGE
  and RED hours by up to +2 (capped at RED) but leave GREEN hours alone, so a hot night does
  not paint 03:00 as dangerous. Matches the spec example "a hot night turns YELLOW into ORANGE".
- **Day window is 06:00 to 19:59.** The day band, blocks and work windows use hours that start
  at 06:00 through 19:00, so the last block ends at "20:00".
- **Heavy-work windows exclude the noon pause.** On ORANGE-or-worse days the 12:00 to 15:00
  pause is removed from `heavy_work_windows`, so the agent never has to compute times itself.
- **Delhi bounding box = grid extent.** lat 28.35 to 28.95, lon 76.75 to 77.35 (the 36 grid
  points plus half a cell). Locations outside are rejected.
- **Stull check.** All six spec wet-bulb values reproduce within 0.06 C, so no correction needed.
- **Perceptual hash is a pure-Pillow dHash, not the imagehash library.** imagehash pulls in numpy,
  scipy and PyWavelets (~150 MB), which would crowd the 250 MB Lambda layer limit next to the
  Strands layer. dHash is a standard perceptual hash; duplicates are Hamming distance <= 4 of 64.
- **Geohash is implemented in `common/geo.py`.** geohash2 ships only as a source distribution, so it
  cannot be fetched as a Linux wheel without Docker. A unit test checks our encoder against geohash2.
- **DepsLayer is built with a Makefile from Linux wheels** (`--platform manylinux2014_x86_64`), so
  `sam build` works on a Mac without Docker. botocore and friends are removed from the layer because
  the Lambda runtime provides them. Every function gets the Strands layer (for pydantic) + DepsLayer.
- **Webhook dedupe uses a conditional put on the Idempotency table** (`attribute_not_exists(pk)`)
  instead of the Powertools idempotency decorator: the key is the channel message id, which the
  webhook already has, and the behaviour is easy to unit test. Powertools provides logs, metrics
  and tracing.
- **Officer queue endpoint added.** The spec lists PATCH /reports/{id} and GET /briefs/{agency} but no
  list call for /officer, so `GET /officer/reports` (Cognito, own agency only) was added. Web reports
  poll `GET /reports/{id}/status`, also added. Both are documented in docs/api-contract.md.
- **Officer brief uses Bedrock Converse directly** with strict JSON output, and drops any action that
  cites a report id that was not in the input, so the brief cannot invent evidence.
- **Agency claim comes from the Cognito ID token** (`custom:agency`); the web app sends the ID token as
  the Bearer token because access tokens do not carry custom attributes.
- **Last location is stored only as geohash6** (about 1 km) with a timestamp; it is used for 6 hours.
  A photo sent without a recent location waits under reports/hold/ (1-day lifecycle) until a pin arrives.
- **Emergency guard is deterministic.** Besides the prompt, a keyword check (English, Hinglish, Hindi)
  forces "Call 112 now" onto line 1 when heatstroke signs are described, even if the model forgets.
- **Bedrock defaults** are `global.anthropic.claude-haiku-4-5-20251001-v1:0` (chat, vision) and
  `apac.amazon.nova-lite-v1:0` (fallback). These are template parameters: confirm with
  `scripts/check_bedrock.sh` in M0 and override at deploy time if the account sees other ids.

## Pan-India coverage and the P2 features (2026-10-09)

The team asked for pan-India coverage plus water-access reports, Hindi voice, a crew schedule and
Cedar permissions. Choices made, and why:

- **Three coverage tiers** (data/cities.json, risk/grid.py). Delhi stays the full demo city
  (hotspots, agencies, replays). Ten more cities get a 3 x 3 grid on the live map (126 cells in
  all). Any other point in India gets a personal plan from a point forecast. The humid-heat rule is
  physiology-based, so the same bands apply everywhere; only the noon pause cites Delhi's HAP.
- **City centres come from the Open-Meteo Geocoding API**, never typed by hand. Mumbai's and
  Chennai's grids are moved inland (grid_centre_override) so a third of the grid is not sea.
- **Agency names outside Delhi are starting values** (agency_confidence = low), like the Delhi
  hotspot owners. A teammate must check them; Bengaluru uses GBA (Greater Bengaluru Authority).
- **India check is a rough bounding box** (6.5-37.1 N, 68.1-97.4 E). Place names are also filtered
  by country code IN; a pin just across a land border can still pass. Production fix: Amazon
  Location reverse geocoding.
- **Open-Meteo budget:** 126 cells hourly = about 3,000 calls a day plus cached personal lookups,
  inside the 10,000/day free tier. RiskRefreshFn timeout raised to 180 s.
- **Heat cache is one snapshot item per hour** (pk "heatgrid") holding every cell, instead of one
  item per cell per hour: about 50 writes an hour instead of over 6,000, so on-demand cost stays flat.
- **Area rain risk** for streets without listed hotspots: same formula with
  `area_susceptibility: 0.6`, so heavy rain alone reaches HIGH but never SEVERE; only listed spots
  go higher. Area rain alerts use their own template ("your area").
- **find_relief is capped at 25 km** so a Mumbai user is never sent to a Delhi cooling zone; with
  nothing nearby it returns the national helplines 112, 1070 and 1077.
- **Eight agent tools, not six.** get_crew_schedule and report_water_issue were added; both are
  closed over the user context like the others. Eval E8 ("weather in Mumbai" -> Delhi only) and E18
  (Gurgaon refused) no longer fit pan-India coverage: E8 now asks about London, E18 expects a plan.
  Seven new cases E27-E33 cover cities, crews and water reports (33 cases in all).
- **Crew schedule** (risk/crew.py, risk.yaml `crew`) is derived from the worker plan, so the two can
  never disagree: heavy work only in the plan's heavy-work windows (noon pause already removed),
  work/rest minutes and water per band from the band advice. Rest is staggered across groups
  (60 / rest minutes) so the site never stops and the shade is never crowded. Starting values; check
  against NDMA guidance before the video.
- **Water-access reports.** Photos of leaks, dirty water or tanker queues go through the same
  verifier and route to the city's water agency (DJB in Delhi). Tanker no-shows and dry taps cannot
  be photographed, so text reports exist: stored at the ~1 km geohash6 cell centre, never the exact
  point, and public only once 3 independent reporters in that cell agree within 24 hours.
- **Hindi voice** (common/voice.py, behind VoiceEnabled): Amazon Transcribe batch with language
  identification between hi-IN and en-IN, polled up to 45 s inside the 90 s worker; the voice note
  is deleted right after (plus a 1-day lifecycle on voice/). Amazon Polly's neural Kajal voice speaks
  the reply without links or the data footer; the text reply is sent first, so voice failure never
  loses the answer.
- **Cedar for officer actions** (backend/policies/reports.cedar, validated against
  schema.cedarschema in tests) via cedarpy (Apache-2.0). Fail closed if the engine cannot load. New:
  the owning agency can hand a report to another known agency (the 71 disputed Delhi points), and a
  `control_room` Cognito group reads every report in its city without changing anything.
- **Map political view.** The Amazon Location style is requested with `political-view=IND` so
  borders appear as officially shown in India at the all-India zoom. The keyless OpenFreeMap
  fallback has no such option; deploy with the Amazon map key for the video.
- **Backtest D** (backtests/heat_cities_2026.py): 127 city-days across 11 cities in 2026 were
  dangerous by humidity but never met a 40 C rule; Kolkata had 42 dangerous days and the 40 C rule
  caught none. One city-centre point per city, modelled data. Do not round.

## Worker-first redesign, air quality and the landing page (2026-10-09)

The team found the site overwhelming for workers who read slowly or not at all, and asked for a
modern, animated site. Two audiences, two designs:

- **`/check` is for workers.** One giant answer (colour + icon + under six words), picture cards
  instead of paragraphs, and a Listen button using the phone's own text-to-speech (Web Speech API,
  hi-IN) so nothing extra is downloaded. Only fixed copy and numbers are spoken. Call 112 and Send on
  WhatsApp are full-width. No animation library and no map: about 4 KB gzipped for budget phones.
  Water glasses per hour match the crew plan (risk.yaml crew.water_ml_per_hour / 250 ml).
- **`/` is a landing page for judges and the public**, with `motion` (MIT) for scroll reveals,
  count-ups, the example chat and a scroll-linked steps line. LazyMotion with domAnimation keeps it
  to one ~45 KB gzipped chunk that /check and /map never load. MotionConfig reducedMotion="user" and
  CSS guards turn every animation off for prefers-reduced-motion. The phone chat is labelled an
  example; every other number on the page is live API data or our backtest.
- **The map moved from `/` to `/map`.** This changes what judges see first (spec 10.2 puts the map at
  `/`); the landing hero links straight to it and to the worker view. Revert by swapping two routes
  in App.tsx if the team prefers.
- **Air quality and UV** from the Open-Meteo Air Quality API (free, no key, CC BY 4.0). The India
  AQI is an *estimate*: 24-hour means of modelled PM2.5 and PM10 through the CPCB sub-index
  breakpoints (risk.yaml `air`), the worse sub-index wins. Official NAQI needs monitoring stations and
  3+ pollutants; a data.gov.in API key would allow official CPCB station readings later. UV uses WHO
  categories. Advice is fixed copy (CPCB health statements, WHO sun advice). In October Delhi's heat
  band is GREEN while its air is MODERATE to POOR, so this is the hazard that matters this month.
- **`GET /now`** returns one screen of answers (heat now and next 48 h, today's safe windows, rain,
  AQI estimate, UV) for any point in India, from the same engines; it backs /check and the dashboards.
- **CSS base styles moved into `@layer base`.** Unlayered `a { color: inherit }` and
  `button { font: inherit }` were silently overriding Tailwind utilities (a white CTA lost its text;
  button sizes were smaller than intended).
- **Agency names for single-body cities** (KMC, BMC, AMC, ...) now keep the corporation's name.

## Female voice and wider pan-India data (2026-10-09)

- **Female Hindi voice everywhere.** WhatsApp and Telegram replies already use Amazon Polly's
  Kajal (female, neural). The web Listen button now prefers a female Hindi voice on the phone
  (Google `hi-in-x-hia`/`hi-in-x-hic`, Apple Lekha/Kiyara, Microsoft Swara/Kalpana). On phones without
  one it plays `GET /speak` (Polly Kajal), and only as a last resort uses another Hindi voice at a
  higher pitch. `/speak` builds its sentences on the server from fixed copy and /now data, so it
  cannot be used as a free text-to-speech service; it is rate-limited per IP.
- **63 cities.** Every million-plus city and every state/UT capital joins as a one-cell city (tier
  `city`), on top of Delhi's 36 cells and the ten big 3 x 3 cities: 178 cells, about 4,300
  Open-Meteo calls a day. City centres are geocoded with a state check (a first pass put "Gurgaon"
  in Maharashtra and "Panaji" in Gujarat; both caught and fixed). Agency names for the new cities
  are starting values, mostly "<City> Municipal Corporation" and the state water body.
- **NCR zones.** Gurugram, Noida, Faridabad and Ghaziabad sit inside Delhi's grid, so they share
  its forecast but route reports to their own bodies (MCG/GMDA, Noida Authority, MCF, GNN) by
  distance from their geocoded centres.
- **Researched hotspots for 10 more cities** (data/hotspots_cities.seed.csv): 120 spots from news
  and official notices, each with a source URL and a verbatim quote. Mumbai, Bengaluru, Chennai,
  Hyderabad, Kolkata, Gurugram, Pune, Ahmedabad, Patna and Guwahati. Almost all are news reports;
  official named lists were rarely published online. 95 were geocoded inside their city by
  data/geocode_city_hotspots.py; the rest stay without coordinates. Every pin needs a check
  (GEOCODING_REVIEW.md). Hotspots score with their own city's forecast cell (nearest cell within
  0.3 degree), never Delhi's.
- **Researched heat-relief places** (data/relief_cities.seed.csv): 77 named cooling shelters,
  shade nets, water points and heatstroke wards in 17 cities, 55 geocoded. Bhubaneswar's Heat Wave
  Action Plan 2025 names about 60 more water points and 15 rider sheds; worth importing later.
- **OpenStreetMap hospitals and drinking water** (data/fetch_osm_relief.py, ODbL): up to 8 named
  hospitals and 6 public drinking-water points nearest each city centre, via the Overpass API with
  mirrors and a cache. OSM `name:hi` is shown in Hindi mode.
- **Backtest D now covers all 63 cities:** 414 city-days in 2026 were dangerous by humidity but
  never met a 40 C rule. Bhubaneswar had 50 dangerous days and the 40 C rule caught 3; Kolkata 42
  and caught none. The chart shows the top 20 cities. Modelled data, one point per city.

## Officer sign-in locally, and a brief that survives a model outage (2026-10-09)

- **Real sign-in is Amazon Cognito** and needs the deployed stack. To try the officer view before
  that, `scripts/dev_api.py` offers demo accounts (pwd/mcd/djb/bmc/control @demo.jaltaap.in,
  password printed at start-up) and HMAC-signed tokens it checks the way API Gateway's JWT
  authorizer would, then calls the real officer handler, so the Cedar rules apply unchanged. The web
  app uses this path only under `vite dev` without Cognito settings; a production build contains no
  dev sign-in code or demo credentials (checked by grepping dist/).
- **Rule-based action brief** when Bedrock is unavailable: the same reports and hotspot risk, grouped
  by spot, ranked by reports, severity and recency, with a fixed ask per hazard. Labelled in the UI
  as built by rules, so officers know it is not the AI brief.

## Helping workers act on the plan (2026-10-10)

- **3-day outlook.** `/now` returns `days` (today and the next two) from the same plan engine; the
  worker screen shows them as three colour cards with safe heavy-work hours. Personal forecasts now
  ask Open-Meteo for 4 days: just after midnight IST its "today" can still be the previous date, which
  had cut off the day after tomorrow.
- **Shift reminders** on the worker screen: water every 60 / glasses-per-hour minutes for the current
  hour's band (the plan's own numbers), a shade reminder each hour (10/15/30 minutes for
  YELLOW/ORANGE/RED), the 12:00 noon pause and the shift end, spoken in the female Hindi voice with
  vibration, plus an "I drank a glass" counter. They run while the page is open; the Screen Wake Lock
  keeps the screen on because browsers pause pages when it turns off. Honest limit, written on the
  card. WhatsApp reminders (an SQS delay chain) are the production path for a phone in a pocket.
- **"Someone is unwell" check** (`/unwell`): eight picture cards. Any danger sign from the chat's
  emergency list (confusion, fainting, hot dry skin without sweat, fits, vomiting) puts Call 112
  first with six first-aid steps and the nearest hospital; milder signs give rest-and-cool steps and a
  "not better in 30 minutes, call 112" button. Fixed copy only: no diagnosis, no medicines, no AI.
- **Reporters hear back.** When an officer confirms, resolves or hands over a report, the WhatsApp or
  Telegram reporter gets a fixed-copy message in their language naming the agency and the spot.
  Marking a report false sends nothing (trust weight handles that). Failures (24-hour window, STOP)
  never block the officer's action.

## Results to keep honest (from backtests, 2026-10-09)

- Backtest A headline: "11 days in 2026 were dangerous by humidity but never met a 40 C heatwave
  rule" (Safdarjung, modelled, 1 Apr to 31 Jul 2026, 06:00-19:59). Do not round it.
- The 22 May 2026 replay peaks at 42.0 C at Safdarjung in the model (news: 46 C), so it shows
  ORANGE, not RED. Thresholds were NOT tuned to match headlines. If the team wants a RED replay
  scene, 19 May 2026 is the modelled peak (44.4 C); changing the scenario is a team decision
  because it changes what users see.
- Backtest C does not yet separate reported from unreported spots, and years_seen includes 2026
  (leakage). Open question for the team: should the flood score keep counting the current year?
- Evals: not yet run against Bedrock (no AWS account on the build machine). Log pass rates here
  after the first deployed run.
