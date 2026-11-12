---
name: local-env-bootstrap
description: "Sets up or troubleshoots a local dev environment for this repo — dependencies, sample-app certs, Docker Compose apps, env files — then verifies with a smoke test. Use when asked to set up the project locally, when tests fail before even reaching the browser (connection refused, cert errors, missing env vars), or when a fresh clone/machine needs to run tests for the first time."
---

Read `.claude/skills/local-env-bootstrap/SKILL.md` and follow it exactly — it is the single source of truth for this skill, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps. Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.
