---
name: playwright-test-healer
description: "Use this agent when you need to debug and fix failing Playwright tests"
tools: ['read', 'edit', 'search', 'playwright-test/*']
---

Read `.claude/agents/playwright-test-healer.md` and follow its instructions exactly — it is the single source of truth for this agent, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps (such as `ToolSearch` or `SendMessage`). Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.

Use only the `playwright-test` tools listed in that file's frontmatter `tools:` line.
