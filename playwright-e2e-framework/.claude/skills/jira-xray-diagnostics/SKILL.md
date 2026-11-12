---
name: jira-xray-diagnostics
description: Diagnoses Jira/Xray connectivity and auth problems in this repo — the "Atlassian Rovo MCP tools aren't showing up", "Jira calls return nothing or fail", "Xray upload/steps fail" class of issue, in both Claude Code and GitHub Copilot. Walks a fixed sequence of checks (MCP config in both harnesses, Rovo sign-in, site/cloudId, project access, Xray token) rather than guessing. Use when Atlassian-Rovo-MCP is disconnected or unauthenticated, jira-story-reader/test-case-creator/test-case-executor fail against Jira/Xray, or a Jira/Xray-touching agent behaves like it has no permissions.
---

<!-- Single source of truth for this skill. GitHub Copilot loads it through
     .github/skills/jira-xray-diagnostics/SKILL.md — keep instructions here harness-neutral. -->

Diagnoses Jira/Xray connectivity in this repo, in the order that actually finds the
problem rather than guessing at the first plausible cause.

There are two separate integrations — keep them apart:

| Integration | Used by | Auth |
|---|---|---|
| **Atlassian Rovo MCP** (`Atlassian-Rovo-MCP`, `https://mcp.atlassian.com/v2/mcp`) | `jira-story-reader`, `test-case-creator` (all Jira reads/writes) | OAuth sign-in per harness — no env-file token |
| **Xray REST** (`{JIRA_BASE_URL}/rest/raven/...`) | `utils/xray-upload.ts`, `scripts/xray.sh`, `test-case-creator` step rows, `test-case-executor` | Bearer `JIRA_XRAY_API_TOKEN` from `.${ENV}.env` |

A working Rovo connection says nothing about the Xray token, and vice versa.

## 1. Is Atlassian Rovo MCP configured in every harness?

The server must be declared in **each** harness's file, with the same name and URL:

| Harness | File | Top-level key |
|---|---|---|
| Claude Code | `.mcp.json` (repo root) | `mcpServers` |
| GitHub Copilot (VS Code) | `.vscode/mcp.json` | `servers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |

```json
"Atlassian-Rovo-MCP": { "type": "http", "url": "https://mcp.atlassian.com/v2/mcp" }
```

(Cursor's entry omits `type` — `{ "url": "..." }` is enough.) No harness reads another's file. If an agent works in one harness but not the
other, diff these two entries first. The server name must stay exactly
`Atlassian-Rovo-MCP` — agent tool lists reference it (`mcp__Atlassian-Rovo-MCP__*` in
`.claude/agents/`, `Atlassian-Rovo-MCP/*` in `.github/agents/`).

## 2. Is it signed in?

Rovo lists **no tools** until the harness has completed Atlassian OAuth, so "tools
missing" usually means "not signed in", not "misconfigured".

- **Claude Code:** run `/mcp`, select **Atlassian-Rovo-MCP**. If it shows
  "needs authentication", choose **Authenticate** and finish the browser login. Then
  start a new session (or reload the VS Code window) so the tools load.
  Check: `ToolSearch` for `"+Atlassian jira"` should list `mcp__Atlassian-Rovo-MCP__getJiraIssue`.
- **GitHub Copilot:** Command Palette → **MCP: List Servers** → **Atlassian-Rovo-MCP** →
  **Start** (or **Restart**); approve the sign-in prompt. Check the tools picker in
  Copilot Chat lists `Atlassian-Rovo-MCP` tools.

Each harness signs in separately — signing in one does not sign in the other.

## 3. Signed in, but calls fail or return nothing?

1. Call `getAccessibleAtlassianResources`.
   - **Empty list** → the account you signed in with has no access to any Atlassian
     site, or you didn't grant the site during OAuth consent. Sign out (`/mcp` →
     Clear authentication, or Copilot's MCP server menu) and sign in again, approving
     the site.
   - **Site listed, but not the one in `JIRA_BASE_URL`** → signed in with the wrong
     Atlassian account. Re-authenticate with the right one.
   - Check the site's `products` entry for `jira` — `access: "read"` means writes
     (`test-case-creator` Phase 2) will fail even though reads work.
2. Call `atlassianUserInfo` to confirm which account is actually behind the session.
3. `searchJiraIssuesUsingJql` with `project = <JIRA_PROJECT_KEY>` (`maxResults: 1`).
   Zero results while the site is accessible means a genuine **project permission
   gap** for that account — this is the case where granting project access helps.
4. An operation reported as unknown → re-run `discover` with different keywords;
   never guess an operation name.

## 4. Xray-specific calls failing

`utils/xray-upload.ts`, `scripts/xray.sh`, and Xray step calls in `test-case-creator`
use **Bearer** auth with `JIRA_XRAY_API_TOKEN` against
`{JIRA_BASE_URL}/rest/raven/{1.0,2.0}/...`. Rovo can't help here and isn't involved.

```bash
set -a; source ".${ENV:-dev}.env"; set +a
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $JIRA_XRAY_API_TOKEN" \
  "$JIRA_BASE_URL/rest/raven/1.0/api/settings/teststatuses"
```

- **401/403** → token missing, expired, or not an Xray token. Regenerate it and update
  `.dev.env` / `.qa.env` (never paste the token into a command or transcript).
- **404** → the instance may be running Xray Cloud's GraphQL API
  (`xray.cloud.getxray.app`) rather than the raven REST compatibility layer. That's a
  different integration, not a credentials problem — don't keep retrying other tokens.

## Quick reference

| Symptom | Likely cause | Check |
|---|---|---|
| Works in Claude Code, not Copilot (or vice versa) | Entry missing/different in `.mcp.json` vs `.vscode/mcp.json`, or only one harness signed in | §1, §2 |
| No `Atlassian-Rovo-MCP` tools at all | Not signed in, or session started before sign-in | §2 |
| `getAccessibleAtlassianResources` empty / wrong site | Wrong account, or site not granted at consent | §3 |
| Site OK but project search empty | Genuine project permission gap | §3 |
| Reads work, creates/transitions fail | Jira access is read-only for that account | §3 |
| `/rest/raven/...` 401/403 | Bad/expired `JIRA_XRAY_API_TOKEN` | §4 |
| `/rest/raven/...` 404 | Xray Cloud GraphQL vs raven REST mismatch | §4 |
