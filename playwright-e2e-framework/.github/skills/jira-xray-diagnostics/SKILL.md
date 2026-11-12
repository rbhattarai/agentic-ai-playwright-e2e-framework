---
name: jira-xray-diagnostics
description: Diagnoses Jira/Xray connectivity and auth problems in this repo — the "Atlassian Rovo MCP tools aren't showing up", "Jira calls return nothing or fail", "Xray upload/steps fail" class of issue, in both Claude Code and GitHub Copilot. Walks a fixed sequence of checks (MCP config in both harnesses, Rovo sign-in, site/cloudId, project access, Xray token) rather than guessing. Use when Atlassian-Rovo-MCP is disconnected or unauthenticated, jira-story-reader/test-case-creator/test-case-executor fail against Jira/Xray, or a Jira/Xray-touching agent behaves like it has no permissions.
---

Read `.claude/skills/jira-xray-diagnostics/SKILL.md` and follow it exactly — it is the
single source of truth for this skill, shared with Claude Code. Ignore its YAML
frontmatter; skip Claude Code–only checks (such as `ToolSearch` or `/mcp`) in favour of
the GitHub Copilot equivalents it lists alongside them.
