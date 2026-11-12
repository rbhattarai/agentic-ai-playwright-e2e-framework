# Copilot Instructions

All project instructions live in [AGENTS.md](../AGENTS.md) at the repository root, shared
by every agent harness (GitHub Copilot, Claude Code, Cursor, Codex, …). Read it and follow
it before making changes. Add or change project guidance in `AGENTS.md`, not here.

## GitHub Copilot specifics

- Agents: `.github/agents/*.agent.md`; skills: `.github/skills/`; MCP servers:
  `.vscode/mcp.json`. These are thin wrappers around the source files in `.claude/agents/`
  and `.claude/skills/` — read and follow the `.claude/` file each wrapper points to.
- To run `test-orchestrator` as the main agent, pick it from the agent dropdown in
  Copilot Chat.
