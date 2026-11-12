---
name: jira-story-reader
description: Reads a Jira user story (summary, description, acceptance criteria, comments, linked issues/subtasks, metadata, attachments) via the Atlassian Rovo MCP server and writes a consolidated requirements/context-<KEY>.md file, downloading attachments to requirements/<KEY>/attachments/. Use when given a Jira issue key (e.g. SCRUM-123) and asked to pull in, read, or summarize story requirements.
tools: ['read', 'edit', 'execute', 'search', 'Atlassian-Rovo-MCP/*']
---

Read `.claude/agents/jira-story-reader.md` and follow its instructions exactly — it is the
single source of truth for this agent, shared with Claude Code. Ignore its YAML
frontmatter and any Claude Code–only steps (such as `ToolSearch`); in Copilot the
Atlassian Rovo MCP tools are already available as `Atlassian-Rovo-MCP/*`.

This agent is read-only against Jira: never call a Rovo create/edit/transition/comment
tool or `executeWrite`/`executeDestructive`.
