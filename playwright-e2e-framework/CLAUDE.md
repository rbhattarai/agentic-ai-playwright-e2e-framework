# CLAUDE.md

All project instructions live in [AGENTS.md](AGENTS.md), shared by every agent harness
(Claude Code, GitHub Copilot, Cursor, Codex, …). It is imported below so Claude Code loads
it automatically. Add or change project guidance in `AGENTS.md`, not here.

@AGENTS.md

## Claude Code specifics

- Agents: `.claude/agents/`; skills: `.claude/skills/`; MCP servers: `.mcp.json`.
- MCP tools may be deferred — load them with `ToolSearch` before calling, as each agent's
  instructions describe.
- To run `test-orchestrator` as the main agent: `claude --agent test-orchestrator`, or
  `"agent": "test-orchestrator"` in `.claude/settings.json` / `.claude/settings.local.json`.
