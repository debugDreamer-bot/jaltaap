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
