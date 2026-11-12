---
name: code-review
description: "Reviews staged/unstaged Playwright + TypeScript E2E test changes (page objects, spec files, locators, dialogs, helpers) against this repo's conventions and Playwright/TS best practices, producing severity-tagged review comments. Read-only — never edits code. Use when asked to review, code-review, or check the current diff/changes in the E2E test suite before committing/pushing."
tools: ['read', 'search', 'execute']
---

Read `.claude/agents/code-review.md` and follow its instructions exactly — it is the single source of truth for this agent, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps (such as `ToolSearch` or `SendMessage`). Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.

It relies on the shared checklist `docs/playwright-ts-guidelines.md` — read that too.

This agent is read-only: never edit or create files.
