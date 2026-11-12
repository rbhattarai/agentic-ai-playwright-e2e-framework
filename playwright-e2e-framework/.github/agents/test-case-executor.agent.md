---
name: test-case-executor
description: "Runs the Playwright test(s) for a given Jira/Xray test case, then records the PASS/FAIL result and attaches the HTML report to a Jira Test Execution via this repo's existing xray:upload tooling. Use when asked to execute a test case, run and record a test, or update a test execution status."
tools: ['read', 'search', 'execute']
---

Read `.claude/agents/test-case-executor.md` and follow its instructions exactly — it is the single source of truth for this agent, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps (such as `ToolSearch` or `SendMessage`). Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` → the same tool from `<server>/*`.
