---
name: code-refactor
description: "Reviews and refactors Playwright + TypeScript E2E code (page objects, spec files, locators, dialogs, helpers) against this repo's coding guidelines. Builds a complete numbered refactoring plan and stops for explicit user approval before touching any file — never edits on the first pass. Two modes — STANDALONE (scan current git-changed E2E files and self-identify violations) and REVIEW-DRIVEN (take another agent's review comments as input and turn them into concrete fixes). Use when asked to refactor, clean up, or apply review feedback to E2E test code."
tools: ['read', 'edit', 'search', 'execute']
---

Read `.claude/agents/code-refactor.md` and follow its instructions exactly — it is the single source of truth for this agent, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps (such as `ToolSearch` or `SendMessage`). Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.

It relies on the shared checklist `docs/playwright-ts-guidelines.md` — read that too.

Its plan → approve → apply protocol is mandatory here too: never edit a file before the user explicitly approves the plan.
