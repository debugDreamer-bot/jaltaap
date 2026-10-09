# Decisions

Dated record of thresholds, trade-offs and choices made without asking the team
(spec rule: "pick the simpler option and note it in DECISIONS.md").

## 2026-10-09

- **Fresh repo, nothing reused.** The earlier HEATSHIELD prototype is not used as a base: the
  rules disqualify reused projects and require a history that matches the event dates.
- **Python import root is `backend/`.** SAM uses `CodeUri: backend/` with handlers such as
  `handlers.worker.handler`, so modules import as `common`, `risk`, `agent`, `handlers`
  (not `backend.common` as in the spec's sketch). Tests run with `backend/` on `sys.path`.
