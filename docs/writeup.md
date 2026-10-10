# JalTaap: heat and water safety for Delhi's outdoor workers

## Problem
- Several parts of Delhi crossed **46 °C on 22 May 2026**. The city has cooling zones,
  helplines and a 12:00–15:00 pause on outdoor construction work, but its warnings are
  city-wide and temperature-only.
  ([UNI](https://www.uniindia.com/), [Tribune](https://www.tribuneindia.com/))
- Delhi Traffic Police flagged **169 waterlogging-prone hotspots** in 2026. The official lists
  change every year (308 points in 2023, 194 in 2024, 445 for 2025), and 71 points had disputed
  owners. ([Daily Pioneer](https://dailypioneer.com/), [The Week](https://www.theweek.in/))
- The ILO projects India loses **5.8 % of working hours to heat by 2030**. In a 2026 survey, 90 %
  of outdoor informal workers cut hours because of heat.
  ([The Quint](https://www.thequint.com/), [Newslaundry](https://www.newslaundry.com/))

## Who it is for
Delhi's outdoor workers: construction workers, delivery riders and street vendors. Most have a
budget Android phone, use WhatsApp and prefer Hindi. Secondary users are the PWD and MCD
engineers who own waterlogging spots.

## What we built
- **Summer (P0).**
  - Send JalTaap a place name or a location pin on WhatsApp, Telegram or the web, and get
    today's hourly plan in your language: when heavy work is safe, how often to drink water, the
    noon pause, and the nearest cooling zone with a directions link.
  - Every forecast reply ends with its data time.
  - Heatstroke symptoms put "Call 112 now" on line 1.
  - Consent goes out on first contact, and STOP deletes everything.
- **Monsoon (P1).**
  - Waterlogging risk for listed hotspots in the next 3 hours, with the owning agency, plus a
    route check.
  - Subscriptions with proactive alerts at most once per hazard per area every 6 hours, and a
    05:30 IST brief.
  - Photo reports are checked by a Bedrock vision model and routed to the agency that owns the
    spot. Officers log in with Cognito to confirm, resolve or reject them and get an AI action
    brief that cites report ids.
- **For judges.** A public map with a heat layer (now to +48 h) and replays of
  22 May 2026 (heat), 9 July 2026 (storm) and 13 July 2026 (humid heat).
- **Across India.**
  - Heat plans work for any place name or pin in India.
  - 62 more cities, every million-plus city and every state and UT capital, are on the live map
    with area rain risk and alerts. Ten big cities also have researched waterlogging hotspots, and
    every city has OpenStreetMap hospitals and drinking-water points. Reports go to each city's
    own corporation and water body (Gurugram, Noida, Faridabad and Ghaziabad included).
- **For supervisors.** A crew heat plan: hour by hour, heavy work only in safe windows, staggered
  rest groups so the site never stops, and the litres of water to carry. It is printable from `/crew`.
- **Water access.** Leaks, tanker no-shows, dry taps and dirty water can be reported by photo or
  plain text. Three independent reporters in the same ~1 km area, or a verified photo, put the
  problem on the map for the water board (the Delhi Jal Board in Delhi).
- **Voice and permissions.** Hindi voice notes go in through Amazon Transcribe and replies come
  back through Amazon Polly. Cedar policies decide who may resolve or hand over a report.

## How it works
![Architecture](architecture.png)

- **Webhooks only acknowledge.** WhatsApp and Telegram webhooks verify the signature or secret,
  deduplicate on the message id and enqueue to SQS.
- **A Lambda worker runs a Strands agent.** It has six tools bound to the user. The model never
  sees a phone number and cannot message anyone.
- **The tools call a pure-Python risk engine.** It is driven by `risk.yaml` and covered by 127
  unit tests. EventBridge Scheduler runs the same engine every hour for 36 grid cells and every
  hotspot.
- **Heat is scored per hour.** An hour is RED if wet-bulb ≥ 30 °C or temperature ≥ 44 °C,
  ORANGE at ≥ 28 / 40, and YELLOW at ≥ 25 / 37. Escalation is at most +1 for a hot night or the
  third hot day in a row, and +1 for the worker's profile.
- **Waterlogging** risk is susceptibility × rain factor + antecedent bonus. A verified photo
  within 300 m marks a spot CONFIRMED.

## Where AWS fits
**Open-source tools:**
- **Strands Agents SDK**: the agent, its tools and the model fallback.
- **AWS SAM CLI**: the whole stack in one template.
- **Powertools for AWS Lambda**: structured logs, custom metrics and tracing.
- **Cedar**: officer permissions as policy files (only the owning agency acts; only verified
  reports close; disputed spots can be handed over).

**AWS services:**
- **Amazon Bedrock**: chat with a Nova fallback, photo verification and officer briefs.
- **AWS Lambda**: 10 functions.
- **Amazon API Gateway**: the HTTP API, with a Cognito JWT authorizer.
- **Amazon SQS**: inbound and alert queues with dead-letter queues.
- **Amazon EventBridge Scheduler**: the hourly refresh and the 05:30 brief.
- **Amazon DynamoDB**: six tables.
- **Amazon S3**: private photos with a 30-day lifecycle, EXIF-free thumbnails and replays.
- **AWS Amplify Hosting**: the web app.
- **Amazon Cognito**: officer login.
- **Amazon CloudWatch**: the JalTaap-Ops dashboard and alarms.
- **Amazon Location Service**: map and geocoding.
- **Amazon SES**: officer emails.
- **AWS Systems Manager Parameter Store**: secrets.
- **AWS Budgets**: alerts at USD 10 and 25.
- **Amazon Transcribe and Amazon Polly**: Hindi voice in and out.

## Data and sources
- **Weather:** [Open-Meteo](https://open-meteo.com/) Forecast, Historical Weather and Previous
  Runs APIs (CC BY 4.0). Historical data is **modelled reanalysis, not station readings**, and
  every replay is labelled that way.
- **Hotspots and relief points:** compiled from linked news reports (`data/*.seed.csv`) and
  geocoded once with OpenStreetMap Nominatim (ODbL). A teammate verifies every pin.

## Results (modelled data, with caveats)
- **Backtest A, humid heat.** "**11 days in 2026 were dangerous by humidity but never met a 40 °C
  heatwave rule**." This is for Safdarjung, 1 April to 31 July 2026, daytime hours. All 11 days
  were in July. The same point had 32 days at 40 °C or more and 43 JalTaap ORANGE-or-worse days.
- **Backtest D, across India.** "**414 city-days across 63 Indian cities in 2026 were dangerous by
  humidity but never met a 40 °C heatwave rule**." Bhubaneswar had 50 dangerous days and the 40 °C
  rule caught 3; Kolkata 42 and it caught none. One city-centre point per city, modelled data.
- **Backtest B, day-ahead.** Of 43 ORANGE-or-worse days, 35 were flagged a day ahead; 9 of 44
  day-ahead flags were false alarms. Both sides come from the same model family, so this
  measures forecast consistency, not real-world skill.
- **Backtest C, the 9 July 2026 storm.**
  - Model rain exceeds 100 mm in 10 of 36 grid cells. Our first HIGH hotspot appears at 04:00,
    before the 05:00–09:00 rain peak.
  - This replay uses archive rain as if it were a perfect forecast; a real forecast would do worse.
  - Of the 7 spots listed as waterlogged in 2026 news, 3 reached HIGH or worse (Azadpur, Zakhira,
    Minto Bridge). Of the 9 traffic-disruption spots, 2 did.
  - **Honest caveat:** 3 of 7 spots not reported in 2026 also reached HIGH, so with 23 geocoded
    spots the model does not yet separate reported from unreported places. The "years listed"
    input also includes 2026. A real evaluation needs the official lists and timestamped reports.
- **Model vs headlines.** On 22 May the model peaks at 42 °C at Safdarjung, below the 46 °C in
  the news, so that replay shows ORANGE rather than RED. We did not tune thresholds to match.

## AI tools used
Claude Code (Anthropic, Claude Opus 5.5) was used to write code, tests and docs, as listed in
[AI_USAGE.md](../AI_USAGE.md). Commits carry a co-author trailer, and the team reviewed every
commit. In the product itself, Amazon Bedrock handles language and photo checks only; risk is
always computed by the tested engine.

## Limitations and what is next
- **IMD warnings.** The adapter is ready behind `IMD_ENABLED`, pending API access.
- **Official hotspot lists.** Add the official Traffic Police and PWD lists, and verify every pin.
- **SMS.** Needs TRAI DLT registration, so it is the production path rather than part of the demo.
- **WhatsApp templates.** Proactive alerts outside the 24-hour window need approved templates.
- **Hotspot lists for every city.** Outside Delhi, rain risk is for the area until official
  hotspot lists are added; agency names there need checking.
- **More languages.** Voice and copy in Bengali, Tamil, Marathi and Telugu for the new cities.
- **Native review.** A native speaker should review all Hindi copy.

## Links
- Repository: _add_
- Live site: _add_
- Video: _add_
- Blog: _add_
