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
