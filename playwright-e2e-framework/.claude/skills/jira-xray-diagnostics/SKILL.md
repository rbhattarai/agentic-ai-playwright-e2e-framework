---
name: jira-xray-diagnostics
description: Diagnoses Jira/Xray MCP connectivity and auth problems in this repo — the "jira MCP tools aren't showing up", "Jira/Xray calls return nothing or fail" class of issue. Walks a fixed sequence of checks (config location, env vars, live REST calls, uv cache) rather than guessing. Use when the jira MCP server is disconnected, jira-story-reader/test-case-creator/test-case-executor fail against Jira/Xray, or a Jira/Xray-touching agent behaves like it has no permissions.
---

Diagnoses Jira/Xray connectivity issues in this repo, in the order that actually finds
the problem (derived from real incidents hitting each of these in turn) rather than
re-deriving it from scratch or guessing at the first plausible cause.

## 1. Is the `jira` MCP server even connected?

`ToolSearch` for `mcp__jira__jira_get_all_projects`. If it's not found:

- Check `.mcp.json` exists **at the repo root** — the Claude Code CLI only reads project
  MCP servers from there. `.vscode/mcp.json` is a separate file for the VS Code
  extension's own MCP integration; the CLI never reads it. If someone "moved" the config
  into `.vscode/`, the CLI's copy is gone — restore `.mcp.json` at root (see
  `scripts/jira-mcp-server.js` for the expected `{"mcpServers": {"jira": {"command":
  "node", "args": ["scripts/jira-mcp-server.js"]}}}` shape).
- If `.mcp.json` is correct but tools still aren't showing up, the session needs a
  restart — Claude Code loads project MCP servers at session start, not on file change.

## 2. Does it connect but return nothing / empty results?

`mcp__jira__jira_get_all_projects` returning `[]`, or `jira_search` with `assignee =
currentUser()` returning zero results when you know issues exist — **this looks like a
permissions problem but usually isn't.** Verify the actual identity behind the
credentials before touching Jira project permissions:

```bash
set -a; source ".${ENV:-dev}.env"; set +a
curl -s -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/myself"
```

- **`"Client must be authenticated to access this resource."`** → the token is flat out
  invalid for this endpoint, not under-permissioned. The most common cause in this repo:
  `JIRA_XRAY_API_TOKEN` was used where a real Jira API token belongs.
  `JIRA_XRAY_API_TOKEN` is scoped to Xray's own import/raven endpoints (used via Bearer
  auth in `utils/xray-upload.ts`) — it does not authenticate as a user against the
  standard Jira REST API's Basic auth. The fix is a **separate** `JIRA_API_TOKEN`,
  generated at `id.atlassian.com/manage-profile/security/api-tokens` under the actual
  Jira user account, added to `.dev.env`/`.qa.env`, and used for `JIRA_USERNAME`/
  `JIRA_API_TOKEN` in `scripts/jira-mcp-server.js`.
- **Returns a real user JSON** (`displayName`, `accountId`, etc.) → credentials are
  valid. Now check project visibility specifically:
  ```bash
  curl -s -u "$JIRA_USER_EMAIL:$JIRA_API_TOKEN" "$JIRA_BASE_URL/rest/api/3/project/search"
  ```
  Empty `values` here (with valid `/myself`) means a genuine permissions gap on that
  project — this is the case where actually granting project access helps.
- **Whichever env var you just fixed, the running `jira` MCP subprocess won't pick it
  up** — it's a long-lived process spawned once with credentials baked into its launch
  command (`scripts/jira-mcp-server.js` passes them as CLI flags to `uvx
  mcp-atlassian`). A env-file edit requires a Claude Code restart to take effect, not
  just re-running a tool call.

## 3. `uvx mcp-atlassian` fails to install

```
error: Failed to install: ... Caused by: failed to hardlink file ... (os error 396)
```

This repo lives under OneDrive-synced paths on Windows; `uv`'s cache can't hardlink
across that filesystem boundary. Fix: `UV_LINK_MODE=copy` (already set in
`scripts/jira-mcp-server.js`'s spawn env — if this error reappears, check that env var
is still being passed through, e.g. after an edit to that script).

## 4. Xray-specific (not general Jira) calls failing

`utils/xray-upload.ts` and any Xray step/test-management REST calls (see
`test-case-creator`) use **Bearer** auth with `JIRA_XRAY_API_TOKEN` against
`{JIRA_BASE_URL}/rest/raven/{1.0,2.0}/...` — a completely different auth scheme and API
surface from the Basic-auth `/rest/api/3/...` calls above. A working `/rest/api/3/myself`
does not imply the raven endpoints work, and vice versa. If a raven endpoint 404s, the
instance may be running Xray Cloud's GraphQL API instead of the REST compatibility
layer — that's a different integration, not a credentials problem; don't keep retrying
different tokens against it.

## Quick reference

| Symptom | Likely cause | Check |
|---|---|---|
| `jira` tools not in ToolSearch | Wrong/missing `.mcp.json` at root, or stale session | §1 |
| Tools respond but return `[]`/empty | Wrong token type (Xray token used for Basic auth) | §2, `/myself` |
| `/myself` returns a real user but `/project/search` is empty | Genuine project permission gap | §2 |
| `uvx mcp-atlassian` install fails with os error 396 | OneDrive hardlink issue | §3 |
| `/rest/raven/...` calls 404 | Xray Cloud GraphQL vs REST API mismatch | §4 |
