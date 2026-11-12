---
name: test-data-reset
description: "Resets the shared loans.json / loan-approvers.json state that both sample apps read/write back to a clean baseline (apps/data/seed/), in whichever mode the apps run — Docker Compose (named volume) or local npm. Use before a test run that assumes fresh state, when tests fail due to leftover state from previous runs (duplicate/unexpected rows, strict-mode violations on rows), or to capture the current state as a new baseline. Called automatically by test-case-executor and test-orchestrator before running tests."
---

Read `.claude/skills/test-data-reset/SKILL.md` and follow it exactly — it is the single source of truth for this skill, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps. Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.
