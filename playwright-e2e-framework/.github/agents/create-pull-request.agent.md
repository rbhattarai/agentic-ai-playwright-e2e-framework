---
name: create-pull-request
description: "Creates a feature branch and raises a pull request (GitHub) or merge request (GitLab) for E2E test changes, or pushes follow-up commits to an already-open PR/MR after review feedback. Detects the git host from the remote and uses its MCP server first (GitHub MCP / GitLab MCP), falling back to the host CLI (gh / glab), then to plain git. Builds a plan and stops for explicit user approval before any git/host mutation. Use when asked to raise a PR or MR, create a branch, or push review-feedback fixes to an open PR/MR for E2E test work."
tools: ['read', 'search', 'execute', 'github/get_me', 'github/list_pull_requests', 'github/pull_request_read', 'github/create_pull_request', 'gitlab/get_project', 'gitlab/list_merge_requests', 'gitlab/get_merge_request', 'gitlab/save_merge_request']
---

Read `.claude/agents/create-pull-request.md` and follow its instructions exactly — it is the single source of truth for this agent, shared with Claude Code. Ignore its YAML frontmatter and any Claude Code–only steps (such as `ToolSearch` or `SendMessage`). Where it names a Claude Code tool, use the Copilot equivalent: `Read` → `read`, `Edit`/`MultiEdit`/`Write` → `edit`, `Bash` → `execute` (terminal), `Grep`/`Glob`/`LS` → `search`, and `mcp__<server>__<tool>` (or a bare MCP tool name such as `create_pull_request` / `save_merge_request`) → the same tool from the `github` / `gitlab` server.

Its plan → approve → apply protocol is mandatory here too: no git push or PR/MR creation before the user explicitly approves.
