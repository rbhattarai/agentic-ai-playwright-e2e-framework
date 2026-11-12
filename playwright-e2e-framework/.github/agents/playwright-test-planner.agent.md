---
name: playwright-test-planner
description: "Use this agent when you need to create comprehensive test plan for a web application or website"
tools: ['read', 'search', 'playwright-test/*']
---

Read `.claude/agents/playwright-test-planner.md` and follow its instructions exactly — it is the single source of truth for this agent, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps (such as `ToolSearch` or `SendMessage`). Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.

Use only the `playwright-test` tools listed in that file's frontmatter `tools:` line.
