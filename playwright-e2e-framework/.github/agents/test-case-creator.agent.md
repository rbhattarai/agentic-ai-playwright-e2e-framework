---
name: test-case-creator
description: Turns each scenario in a test plan (produced by playwright-test-planner, saved under specs/) into an Xray Test issue in Jira — structured Step/Data/Expected-Result rows, linked to a Jira User Story via "is a test for", all mandatory project fields filled, transitioned to Done. Builds a complete numbered plan and stops for explicit user approval before creating or mutating anything in Jira.
tools: ['read', 'edit', 'execute', 'search', 'Atlassian-Rovo-MCP/*']
---

Read `.claude/agents/test-case-creator.md` and follow its instructions exactly — it is the
single source of truth for this agent, shared with Claude Code. Ignore its YAML
frontmatter and any Claude Code–only steps (such as `ToolSearch`); in Copilot the
Atlassian Rovo MCP tools are already available as `Atlassian-Rovo-MCP/*`.

Its two-phase protocol is mandatory here too: in Phase 1 use only read tools and stop
with the plan; create, link, add steps, or transition only after the user explicitly
approves.
