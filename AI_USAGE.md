# AI coding tools used

The hackathon rules require every AI coding tool to be listed. This file is the source for the
"AI tools used" section of the writeup.

| Tool | Model | Used for | Who reviewed |
|---|---|---|---|
| Claude Code (Anthropic), VS Code extension | Claude Opus 5.5 | Scaffolding the repo, risk engine and tests, SAM template, Lambda handlers, Strands agent, web app, backtest scripts, docs drafts | Team DevCore reviews every commit before it is pushed |

Commits written with Claude Code carry a `Co-Authored-By: Claude` trailer, so `git log` shows
exactly which changes were AI-assisted.

Runtime AI (part of the product, not a coding tool): Amazon Bedrock models for chat language
and photo classification. Risk is never computed by an LLM; see `backend/risk/`.
