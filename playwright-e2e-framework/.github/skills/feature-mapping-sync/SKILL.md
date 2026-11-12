---
name: feature-mapping-sync
description: "Syncs feature_mapping.csv (user_story_key,issue_summary,test_case_keys — drives the coverage report in utils/custom-reporter.ts and the email report) from the Jira tags on Playwright specs — story keys on test.describe blocks become rows, Xray test-case keys tagged on individual tests go into the row's test_case_keys column. Adds missing rows/keys directly and reports not-yet-automated stories or unattributed keys. Use when asked to sync/update feature mapping or check coverage report accuracy; called by test-orchestrator after generating specs and by test-case-creator after tagging specs with new test-case keys."
---

Read `.claude/skills/feature-mapping-sync/SKILL.md` and follow it exactly — it is the single source of truth for this skill, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps. Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.

Paths it mentions relative to the skill folder refer to `.claude/skills/feature-mapping-sync/` (scripts); run its scripts from the repository root exactly as written there.
