---
name: test-results-triage
description: "Triages a Playwright run from reports/results.json — lists failing and flaky tests with the failed step, error, and artifacts (trace/screenshot/video), classifies each failure (environment, test-data, locator/UI change, assertion/app behavior, flaky), and routes it to the right fix (local-env-bootstrap, test-data-reset, playwright-test-healer, or a human for a likely app bug). Use after any test run that failed, when asked \"why did the tests fail\", before healing tests, or when a test passed only on retry. Called by test-orchestrator (FIX TESTS route, heal failures) and test-case-executor (on FAIL)."
---

Read `.claude/skills/test-results-triage/SKILL.md` and follow it exactly — it is the single source of truth for this skill, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps. Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.

Paths it mentions relative to the skill folder refer to `.claude/skills/test-results-triage/` (scripts); run its scripts from the repository root exactly as written there.
