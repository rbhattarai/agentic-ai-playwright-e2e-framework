# AGENTS.md

Guidance for AI coding agents working in this repository — harness-agnostic. This is the
single source of project instructions for every agent harness (Claude Code, GitHub
Copilot, Cursor, Codex, and others). Harness-specific entry files (`CLAUDE.md`,
`.github/copilot-instructions.md`) only point here; put new project guidance in this
file, not in them.

## Commands

Run commands from the repository root.

### Setup

```bash
npm install
npx playwright install
```

### Running Tests

```bash
# Run all tests
npm test

# Visible browser, debug, UI mode
npm run test:headed
npm run test:debug
npm run test:ui
npm run test:chromium

# A single spec file, or a single test by title
npx playwright test tests/apps/e2e/e2e-loan-lending-approval.spec.ts
npx playwright test tests/apps/e2e/e2e-loan-lending-approval.spec.ts --grep "Full loan creation, approver assignment, and approval flow"

# Filter by tag (primary way to run specific suites)
npx playwright test --grep "@LoanApproval"
npx playwright test --grep "@MultiApp"

# Using the main run script (handles cert setup, env loading, multi-app isolation)
./run_test.sh -env=dev -tags=@LoanApproval
./run_test.sh -apps=loan-app,lending-app -env=dev -tags=@MultiApp
./run_test.sh -env=qa -tags=@Regression
```

### Reports

```bash
npm run report             # Open Playwright HTML report (reports/)
npm run report:step        # Open custom step report (reports/step-report/index.html)
npm run send-report        # Email HTML report (requires SMTP env vars)
npm run xray:upload        # Upload JUnit results to Jira Xray
```

### Sample Apps (under `apps/`)

```bash
# Run both apps together via Docker (recommended)
cd apps
docker compose up --build

# Run individually for local dev
cd apps/loan-webapp
npm run dev       # https://localhost:3000 (hot reload)
npm start         # https://localhost:3000 (production)

cd apps/lending-webapp
npm run dev       # https://localhost:3001 (hot reload)
npm start         # https://localhost:3001 (production)

# Build either app from the repo root
npm --prefix apps/loan-webapp run build
npm --prefix apps/lending-webapp run build
```

Both apps use HTTPS with mTLS. They share `apps/data/loans.json` via a Docker volume (`shared_data`).

### Environment Setup

Tests require an environment file at repo root, named `.${ENV}.env` (`.dev.env`, `.qa.env`, …).
Create it from the committed template: `cp .example.env .dev.env`, then fill in the blank
secret values. Real env files are gitignored — only `.example.env` is committed; never
commit a real env file or paste its secrets into a command or transcript. Key variables:

| Variable | Purpose |
|---|---|
| `LOAN_APP_URL` / `LENDING_APP_URL` | App base URLs |
| `LOAN_CERT_P12_BASE64` / `LENDING_CERT_P12_BASE64` | Base64-encoded PKCS#12 cert for mTLS |
| `SMTP_*` | Email report delivery |
| `JIRA_*` / `XRAY_*` | Jira site (`JIRA_BASE_URL`, `JIRA_PROJECT_KEY`) and Xray test result upload |
| `DB_*` | PostgreSQL connection |

App URLs, mTLS certificate inputs, and the Jira site come from these env files — do not
hardcode them. `run_test.sh` handles loading environment settings and preparing
certificates for test runs.

## Architecture

### Overview

The root project is a Playwright + TypeScript test framework. `playwright.config.ts`
loads `.${ENV}.env`, discovers `tests/**/*.spec.ts`, and configures the reporters.

### Multi-App vs Single-App Mode

The framework supports both modes through a **unified fixture** (`tests/fixtures/base.ts`):

- **Single-app**: uses Playwright's built-in `page` / `context` plus the custom `requestContext` fixture (backward-compatible). The built-in context carries a client certificate for **every** certificate-enabled app in `apps.config.json` (one per origin, plus the legacy `CERT_PATH`/`CERT_KEY` cert for `APP_URL`), so one `page` can drive all apps with mTLS.
- **Multi-app**: uses `apps` fixture — a `Record<appKey, AppContext>` where each app gets its own isolated browser context, page, and API context with its own certificate

**Never override the built-in `browser`, `context`, or `page` fixtures in
`tests/fixtures/base.ts`** — the Playwright test agents (planner/generator/healer, via the
`playwright-test` MCP server) can only drive the built-in page, and fail with
`Cannot read properties of undefined (reading 'initialize')` otherwise. Customize them
through option fixtures (`clientCertificates`, `viewport`, `actionTimeout`,
`navigationTimeout` in `base.ts`) and launch settings in `playwright.config.ts`
(`use.launchOptions`: `headless` from `PLAYWRIGHT_HEADLESS`, `slowMo` from
`PLAYWRIGHT_SLOWMO`, default 500; the MCP configs set `PLAYWRIGHT_SLOWMO=0` for agents).

The `apps` object is keyed by app names from `apps.config.json` (e.g. `apps['loan-app'].page`).
The `apps` fixture and `AppManager` are the shared boundary for app configuration,
certificates, and browser/API setup — use them instead of creating parallel app setup in
tests.

### App Registry (`apps.config.json`)

All applications are declared centrally. `AppManager` (`utils/app-manager.ts`) loads this at startup, resolves `${ENV_VAR}` interpolation in `baseUrl`, and builds per-app cert configs.

Certificate types supported:
- `p12-to-pem` — decodes base64 PKCS#12 from env var, extracts PEM cert+key at runtime
- `custom-pem` — uses existing PEM files referenced by env var paths

Currently registered apps: `loan-app` (port 3000) and `lending-app` (port 3001).

### Sample Apps Architecture

Both apps are Express/TypeScript/EJS, compiled with `tsc`, served over HTTPS with self-signed certs and mTLS.

**Shared data**: `apps/data/loans.json` and `apps/data/loan-approvers.json` are flat JSON files accessed by both apps. In Docker, they share these via the `shared_data` named volume.

**Real-time cross-app sync (SSE + Webhook)**:
1. After a write to `loans.json`, the app POSTs to the other app's `POST /notify` endpoint
2. The receiving app calls `broadcast("loan-updated")` → pushes an SSE event to all connected browsers
3. Browser `EventSource` on `GET /events` receives the event and calls `window.location.reload()`

Inter-container URLs use Docker service names (`https://lending-webapp:3001`, `https://loan-webapp:3000`) set via environment variables in `apps/docker-compose.yml`. Localhost fallbacks allow local dev without Docker.

The SSE/webhook logic lives in `apps/<app>/src/events.ts` (identical in both apps): `addClient()`, `broadcast()`, `notifyApp()`.

### Page Object Model

- `tests/pages/BasePage.ts` — base class all page objects extend; receives `(page, baseUrl)`
- App-specific page objects: `tests/apps/<app-name>/pages/<Name>Page.ts`
- Row-locator pattern used throughout: `page.locator('tbody tr', { has: page.locator('td:first-child span.badge', { hasText: id }) })`

### Test Organization

```
tests/
  seed.spec.ts              # Seed test for the Playwright test agents (see below)
  fixtures/base.ts          # Unified single+multi-app fixture
  helpers/
    DBHelper.ts             # PostgreSQL queries (singleton pool)
    TableHelper.ts          # Paginated table interactions
    reporting.ts            # stepWithScreenshot() helper
  pages/BasePage.ts
  apps/
    loan-app/pages/         # LoanAppPage.ts
    lending-app/pages/      # LendingAppPage.ts
    e2e/                    # Cross-app workflow specs (e.g. @LoanApproval)
```

**`tests/seed.spec.ts`** is the starting point for the Playwright test agents: the
`playwright-test` MCP server runs it (`planner_setup_page` / `generator_setup_page`), pauses
at its end, and the agent explores/records from that page; generated specs follow its
imports. It imports `test` from `./fixtures/base` and opens the Loan App with the
certificate-carrying built-in `page` — agents can navigate from there to any app. Keep it
on the repo fixtures (deleting it just makes the MCP server recreate a bare default). It's
tagged `@seed` and excluded from normal runs by `--grep-invert @seed` in the npm test
scripts and `run_test.sh` (not in `playwright.config.ts`, which would hide it from the
agents). **While an agent's seed session is paused, other Playwright runs in the repo stall
after "Loading environment"** — end the agent session first.

Use `stepWithScreenshot(test, 'Step name', page, async () => { ... })` to wrap each test step — it creates a named `test.step` and attaches a full-page screenshot for the step report.

TypeScript path aliases (`tsconfig.json`): `@helpers/*` → `tests/helpers/*`, `@fixtures/*` → `tests/fixtures/*`.

### Reporting

Six reporters run simultaneously (configured in `playwright.config.ts`):

| Reporter | Output |
|---|---|
| `list` | Console |
| `html` | `reports/index.html` |
| `json` | `reports/results.json` |
| `junit` | `reports/junit.xml` |
| `custom-reporter.ts` | `reports/coverage-report.html` (user story → Xray test case coverage via `feature_mapping.csv`) |
| `step-report-reporter.ts` | `reports/step-report/index.html` (step-level screenshots, collapsible UI) |

**Important**: Playwright's built-in HTML reporter wipes `reports/` during `onEnd`. The `StepReportReporter` buffers all screenshot data as in-memory `Buffer` objects during `onTestEnd` (in `pendingAssets[]`) and flushes them to `reports/step-report/assets/` only in its own `onEnd`, after the directory is recreated.

### CI/CD

`.gitlab-ci.yml` defines stages: validate → test → xray → notify.

`run_test.sh` orchestrates cert setup, env loading, and Playwright invocation by calling modular scripts in `scripts/`:
- `parse-args.sh` — CLI arg parsing (`-env`, `-apps`, `-tags`)
- `setup-env.sh` / `validate-env.sh` — env file loading and validation
- `convert-certs.sh` — base64 p12 → pem conversion
- `multi-app-setup.sh` — per-app browser context setup
- `download-certs.sh` — CI certificate retrieval

## Repository Conventions

- Import the unified `test` and `expect` from `tests/fixtures/base`, not raw
  `@playwright/test`. Use `apps` for cross-app scenarios and access contexts by registry
  key (`apps['loan-app']`, `apps['lending-app']`). Keep older single-app tests compatible
  with the standard Playwright fixtures.
- Page objects extend `tests/pages/BasePage.ts`, take `(page, baseUrl)`, and live under
  `tests/apps/<app-name>/pages/`. Use `stepWithScreenshot` from `@helpers/reporting` for
  named test steps and step-report screenshots.
- Cross-app workflow specs belong under `tests/apps/e2e/` (page objects and single-app
  specs do not). Tag tests per the Tags Convention below; Jira-tagged coverage is mapped in
  `feature_mapping.csv`.
- Use the TypeScript path aliases `@helpers/*` and `@fixtures/*` instead of deep relative
  imports.
- Full Playwright/TypeScript review checklist and severity rubric:
  [docs/playwright-ts-guidelines.md](docs/playwright-ts-guidelines.md).

### Tags Convention

- `@SmokeTest` — fast, critical-path tests
- `@Regression` — full regression suite
- `@MultiApp` — requires multi-app `apps` fixture
- `@LoanApproval` — E2E cross-app loan approval workflow
- `@SCRUM-XXX` — Jira key. **Where** it goes tells you what it is:
  - in a `test.describe` title → the **user story** the block covers
  - on an individual test (`test('title', { tag: ['@SCRUM-10'] }, …)`) → that test's
    **Xray test case**, added by `test-case-creator` when it creates the test case
- `@ApiContract` — API-only contract tests generated by the `api-contract-validator`
  skill (reserved; no tests carry this tag yet since no OpenAPI spec exists)

```ts
test.describe('Loan Rejection Workflow @MultiApp @SCRUM-4', () => {        // story
  test('reject a loan', { tag: ['@SCRUM-10'] }, async ({ apps }) => { … }); // Xray test case
});
```

`utils/xray-upload.ts` reports results against every Jira key it finds in spec tags, and
`test-case-executor` selects tests with `--grep "@<KEY>"`, so a test case is only
runnable/reportable by key once its test carries the tag.

### Coverage mapping (`feature_mapping.csv`)

Drives the coverage report (`utils/custom-reporter.ts` → `reports/coverage-report.html`)
and the coverage section of the emailed report (`utils/send-report-email.js`). One row per
user story; **derived from spec tags** by the `feature-mapping-sync` skill — don't
hand-edit keys that no spec carries.

```csv
user_story_key,issue_summary,test_case_keys
SCRUM-5,E2E Loan Approval Workflow,SCRUM-10;SCRUM-11
```

| Column | Source |
|---|---|
| `user_story_key` | Story key from the `test.describe` tag |
| `issue_summary` | Jira summary from `requirements/context-<KEY>.md` if present, else the describe title |
| `test_case_keys` | Xray test-case keys from test-level tags, `;`-separated (the reporters split on commas) |

A story counts as covered when a test tagged with its story key or one of its test-case
keys runs; the report also shows how many of its test cases ran.

## AI Harness Support

Everything AI-related in this repo — instructions, agents, skills, MCP servers — must work
across agent harnesses. Any change on one side needs the matching change on the others.

| | Claude Code | GitHub Copilot (VS Code) | Cursor / Codex / others |
|---|---|---|---|
| Project instructions | `CLAUDE.md` → imports `AGENTS.md` | `AGENTS.md` (+ `.github/copilot-instructions.md` → points here) | `AGENTS.md` |
| MCP servers | `.mcp.json` (`mcpServers`) | `.vscode/mcp.json` (`servers`) | Cursor: `.cursor/mcp.json` (`mcpServers`); others: the harness's own MCP config, mirroring these entries |
| Agents | `.claude/agents/<name>.md` | `.github/agents/<name>.agent.md` | Read the `.claude/agents/<name>.md` file and follow it as instructions |
| Skills | `.claude/skills/<name>/SKILL.md` | `.github/skills/<name>/SKILL.md` | Read the `.claude/skills/<name>/SKILL.md` file and follow it |
| MCP tool names in `tools:` | `mcp__<server>__<tool>` | `<server>/*` | — |
| Built-in tools | `Read`, `Write`, `Edit`, `Bash`, `Grep`, `Glob` | `read`, `edit`, `execute`, `search` | — |

- **`AGENTS.md` is the single source of project instructions.** `CLAUDE.md` and
  `.github/copilot-instructions.md` stay thin pointers to it.
- **`.claude/` holds the single source of truth** for agent/skill instructions, written
  harness-neutrally (refer to MCP tools by their bare name, e.g. `getJiraIssue`; note
  harness-specific steps like Claude Code's `ToolSearch` or `SendMessage` explicitly as
  such).
- **`.github/` agent/skill files are thin wrappers**: Copilot-format frontmatter (name,
  description, Copilot tool names) plus an instruction to read and follow the matching
  `.claude/` file. Don't copy instructions into them — that's how they drift apart.
- MCP server names must match exactly across all MCP config files, since agent tool lists
  reference them.

### Atlassian (Jira) access

All Jira access goes through the hosted **Atlassian Rovo MCP** server
(`Atlassian-Rovo-MCP`, `https://mcp.atlassian.com/v2/mcp`), declared in every harness's
MCP config (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`). It authenticates by
OAuth sign-in per harness (Claude Code: `/mcp` → Authenticate; Copilot: *MCP: List
Servers* → Start; Cursor: Settings → MCP → sign in), not by env-file tokens. Primary tools (e.g.
`getJiraIssue`, `searchJiraIssuesUsingJql`, `createJiraIssue`, `transitionJiraIssue`) are
called directly; other operations are found with `discover` and run via
`executeRead`/`executeWrite`. Every call needs a `cloudId`: agents pass `JIRA_BASE_URL`
read from the active env file (`.${ENV:-dev}.env`), which Rovo accepts as a site URL.
**Never hardcode the Jira site URL or cloudId** in agents, skills, docs, or CI config —
it lives only in the env files (`.dev.env`, `.qa.env`, …) or, in CI, a GitLab CI/CD
variable of the same name.

The one exception is **Xray** (no Rovo operations): `utils/xray-upload.ts`,
`scripts/xray.sh`, and `test-case-creator`'s step rows call `{JIRA_BASE_URL}/rest/raven/...`
directly with Bearer `JIRA_XRAY_API_TOKEN`.

### Git hosting access (GitHub / GitLab)

The framework works whether the repo lives on GitHub or GitLab (or is mirrored to both).
`create-pull-request` reads the remote URL to pick the host, then uses the first
integration that works, in this order:

| Order | GitHub | GitLab |
|---|---|---|
| 1. MCP server | `github` → `https://api.githubcopilot.com/mcp/` | `gitlab` → `https://gitlab.com/api/v4/mcp` (self-managed: `https://<your-host>/api/v4/mcp`) |
| 2. CLI | `gh` (`gh auth login`) | `glab` (`glab auth login`) |
| 3. Plain git | push + compare URL to open the PR by hand | push with `-o merge_request.create` options |

Both servers are declared in every MCP config (`.mcp.json`, `.vscode/mcp.json`,
`.cursor/mcp.json`), with the same server names, `github` and `gitlab`. You only need to
set up the one for your host. A server you don't use just shows as disconnected, and the
agent skips it.

Signing in for each harness:

| | GitHub MCP | GitLab MCP |
|---|---|---|
| Claude Code | PAT in the `GITHUB_PERSONAL_ACCESS_TOKEN` **shell** env var (expanded into the `Authorization` header in `.mcp.json`; GitHub's remote server has no OAuth flow for Claude Code) | OAuth: `/mcp` → `gitlab` → Authenticate |
| Copilot (VS Code) | OAuth with your GitHub account: *MCP: List Servers* → `github` → Start | OAuth: *MCP: List Servers* → `gitlab` → Start |
| Cursor | PAT in `GITHUB_PERSONAL_ACCESS_TOKEN` (`${env:…}` header in `.cursor/mcp.json`) | OAuth: Settings → MCP → sign in |

- **GitHub PAT:** use a fine-grained token scoped to the repo, with *Pull requests:
  read/write* and *Contents: read*. Put it in your shell profile or OS environment, never
  in a `.*.env` file or in an MCP config.
- **GitLab prerequisite:** the GitLab MCP server must be allowed for the top-level group
  (GitLab.com) or the instance (self-managed). It accepts OAuth or fine-grained PATs, not
  legacy or project tokens.
- **Self-managed GitLab:** change the `gitlab` URL in all three MCP configs together.

### Custom Agents

Defined in `.claude/agents/` (Copilot wrappers in `.github/agents/`). Agent names use
**hyphens, not underscores** (`jira-story-reader`, not `jira_story_reader`) — keep new
agents consistent with this.

- **`jira-story-reader`** — pulls a Jira issue's summary, description, acceptance
  criteria, comments, linked issues, and attachments into `requirements/context-<KEY>.md`,
  downloading attachments to `requirements/<KEY>/attachments/` (gitignored). Read-only
  against Jira, entirely through Atlassian Rovo MCP: `getJiraIssue` (evidence view maps
  custom fields like "Acceptance Criteria" by name), `listJiraIssueComments`,
  `searchJiraIssuesUsingJql`, and `executeRead` → `downloadJiraIssueAttachment` (returns a
  short-lived download command the agent runs). No env-file Jira token needed. Invoke
  with a Jira issue key, e.g. "use jira-story-reader on SCRUM-123".
- **`playwright-test-planner`** / **`playwright-test-generator`** /
  **`playwright-test-healer`** — explore the app and write a test plan under `specs/`,
  generate specs from a plan, and debug/fix failing tests, via the `playwright-test` MCP
  server.
- **`code-review`** — read-only review of staged/unstaged Playwright/TypeScript E2E
  changes (`tests/**`, `utils/**`, `playwright.config.ts`) against
  `docs/playwright-ts-guidelines.md`, producing severity-tagged
  (Blocker/Major/Minor/Nit) markdown comments. Never edits files.
  Sources the diff from `git diff HEAD` (covers staged + unstaged in one pass) plus
  direct reads of untracked new files.
- **`code-refactor`** — turns violations into an approved-then-applied refactor. Builds a
  numbered plan (diffs, rationale, risk) and stops for explicit user approval before
  editing any file; only applies on a follow-up invocation that contains explicit
  approval language. Two modes: STANDALONE (scans git-changed E2E files itself) and
  REVIEW-DRIVEN (takes `code-review`'s output as input). Shares the
  `docs/playwright-ts-guidelines.md` checklist with `code-review` — update that file, not
  either agent's own copy, when Playwright/TS conventions change.
- **`test-case-creator`** — turns each scenario in a test plan (from
  `playwright-test-planner`, saved under `specs/`) into an Xray Test issue: structured
  Step/Data/Expected-Result rows, an "is a test for" link to a Jira User Story, mandatory
  project fields filled, transitioned to Done. Same plan → approve → apply protocol as
  `code-refactor`, one approval covering the whole per-test-case pipeline — including
  tagging the matching automated test with the new key (`{ tag: ['@<TEST-KEY>'] }`) and
  then running `feature-mapping-sync` so the key lands in `feature_mapping.csv`. Lookups
  (issue types, required fields, link types, transitions) and mutations
  (`createJiraIssue`, `createJiraIssueLink` via `executeWrite`, `transitionJiraIssue`) go
  through Atlassian Rovo MCP — write tools only in the apply phase. Xray step rows are the
  one direct REST call (Bearer `JIRA_XRAY_API_TOKEN`, same as `utils/xray-upload.ts`),
  since Rovo has no Xray operations.
- **`create-pull-request`** — branches, commits, and raises a GitHub PR or GitLab MR for
  E2E changes (or pushes a follow-up commit to an already-open PR/MR after review
  feedback). Detects the host from the remote URL and creates the PR/MR via the host's
  MCP server first, then its CLI (`gh` / `glab`), then plain git (see *Git hosting
  access* above); commits and pushes always go through local `git`. Same
  plan → approve → apply protocol; never operates directly on `main`, never force-pushes.
- **`test-case-executor`** — resets test data (`test-data-reset`), runs the Playwright
  test(s) for a given Jira/Xray test case (`npx playwright test --grep "@<KEY>"`),
  triages any failure (`test-results-triage`), then records PASS/FAIL and attaches the
  HTML report via the existing `npm run xray:upload` script — doesn't reimplement Xray
  upload, reuses `utils/xray-upload.ts`. No approval gate; mirrors what CI already does
  automatically after a run.
- **`test-orchestrator`** — single entry point for E2E test automation requests.
  Classifies the request into one of 10 fixed intents (NEW TESTS, UPDATE PLAN, FIX TESTS,
  EXPLORE APPS, REGENERATE SPEC, READ STORY, CREATE TEST CASES, EXECUTE TEST CASE,
  ANALYZE RESULTS, HOUSEKEEPING), announces the detected intent and route before invoking
  anything, then delegates to one targeted agent, runs one skill, or runs the full NEW
  TESTS pipeline: `jira-story-reader` → `playwright-test-planner` → (checkpoint) →
  `playwright-test-generator` → `test-data-reset` + `playwright-test-healer` →
  `feature-mapping-sync` → `code-review` (→ `code-refactor` if issues) →
  `create-pull-request` → (checkpoint: PR feedback) → `test-case-creator` (checkpoint;
  also tags tests + syncs mapping) → `test-case-executor` (by new test-case keys) →
  `create-pull-request` follow-up commit with the tag/mapping changes (checkpoint) →
  summary. Runs as the **main session agent**, not as a
  subagent — subagents can't spawn other subagents. Claude Code: `claude --agent
  test-orchestrator`, or `"agent": "test-orchestrator"` in settings. GitHub Copilot: pick
  it from the agent dropdown in Copilot Chat (its wrapper lists the allowed sub-agents
  under `agents:`). Other harnesses: use their own way of selecting a custom agent as the
  main agent. Each checkpoint ends the turn and waits for the user's reply in chat.
  Before delegating to an MCP-backed sub-agent (`jira-story-reader`, `test-case-creator`
  → `Atlassian-Rovo-MCP`; the three Playwright agents → `playwright-test`), it checks the
  server's tools are available. It pre-checks with `ToolSearch` in Claude Code and adds an
  `MCP-UNAVAILABLE` guard clause to every delegation prompt. When a server is missing, it
  runs `node scripts/check-playwright-mcp.cjs` (or `jira-xray-diagnostics`) to tell a
  broken server from one the harness didn't enable. It then reports the harness-specific
  fix and the step to resume from ("continue <KEY> from step N").

### Custom Skills

Defined in `.claude/skills/` (Copilot wrappers in `.github/skills/`). A skill is a small,
well-defined procedure; agents call them for housekeeping steps, and users can run any
of them standalone. **Running a skill from an agent:** in Claude Code use the `Skill`
tool; in any other harness read `.claude/skills/<name>/SKILL.md` and follow it.

#### Skill ↔ agent usage

| Skill | Standalone | Called by |
|---|---|---|
| `test-data-reset` | Yes — "reset test data" | `test-case-executor` (before every run); `test-orchestrator` (NEW TESTS step 4 before healing, FIX TESTS before re-running) |
| `test-results-triage` | Yes — "why did the tests fail" | `test-orchestrator` (FIX TESTS before healing, NEW TESTS when healing can't get green, ANALYZE RESULTS route); `test-case-executor` (on FAIL) |
| `feature-mapping-sync` | Yes — "sync feature mapping" | `test-orchestrator` (NEW TESTS step 4b, so new story rows ship in the PR); `test-case-creator` (after tagging tests with new test-case keys) |
| `local-env-bootstrap` | Yes — first-time setup / "env is broken" | `test-orchestrator` (when triage says `environment`, HOUSEKEEPING route); recommended by `test-case-executor` on environment failures |
| `jira-xray-diagnostics` | Yes — "Jira/Xray isn't working" | `test-orchestrator` (any Jira/Xray auth/connectivity failure); recommended by `jira-story-reader`, `test-case-creator`, `test-case-executor` on such failures |
| `api-contract-validator` | Yes — only once an OpenAPI spec exists | None (dormant — see below) |

The Playwright agents (`playwright-test-planner` / `-generator` / `-healer`) don't call
skills directly; the orchestrator runs the relevant skills around them.

#### Skill details

- **`test-results-triage`** — reads `reports/results.json` via
  `.claude/skills/test-results-triage/scripts/summarize-results.cjs` (plain Node, works in
  every harness), lists failing/flaky tests with failed step, error, and artifacts, and
  classifies each failure: `environment` → `local-env-bootstrap`; `test-data` →
  `test-data-reset` + re-run; `locator-or-ui-change` → `playwright-test-healer`;
  `assertion-or-app-behavior` → likely app bug, ask before healing; `flaky` → report with
  a fix suggestion. Read-only. Stops the framework from "healing" tests that failed
  because the app was down, the data was dirty, or the app has a real bug.
- **`api-contract-validator`** — generates API-only Playwright specs
  (`tests/apps/<app-name>/api/*.api.spec.ts`, tagged `@ApiContract`) that assert a
  running backend matches its OpenAPI/Swagger contract (status codes, required response
  fields, auth). **No spec exists in this repo yet** — the skill checks
  `backend-api/openapi.{yaml,json}` (and a broader fallback search) and reports a clear
  no-op if nothing's found, rather than guessing at a contract. Reuses the `apps` fixture's
  existing per-app `apiContext` (`tests/fixtures/base.ts`) — for this repo's mTLS-based
  apps specifically, the auth check is a with-cert-vs-without-cert pair rather than a
  bearer-token check, since OpenAPI security schemes don't model mTLS well. **Dormant:**
  the sample apps are server-rendered (EJS forms); the only JSON endpoint is
  `GET /api/loans` on loan-webapp, and there's no OpenAPI spec, so no agent calls it.
- **`jira-xray-diagnostics`** — fixed diagnostic sequence for "Atlassian Rovo MCP tools
  not showing up" / "Jira or Xray calls return nothing" problems, in any harness:
  server entry present and identical in `.mcp.json`, `.vscode/mcp.json`, and
  `.cursor/mcp.json`, OAuth
  sign-in per harness, `getAccessibleAtlassianResources` / `atlassianUserInfo` to catch
  wrong-account or site-not-granted, a project JQL check to tell those apart from a
  genuine permissions gap, and a separate `JIRA_XRAY_API_TOKEN` check for Xray's raven
  endpoints. Use before assuming a Jira/Xray failure is a permissions issue.
- **`feature-mapping-sync`** — syncs `feature_mapping.csv` from spec tags via
  `.claude/skills/feature-mapping-sync/scripts/sync-feature-mapping.cjs` (uses
  `npx playwright test --list --reporter=json`, so no browser or running app needed;
  `--dry-run` to preview): story keys on `test.describe` titles become rows, test-level
  Xray keys are merged into that row's `test_case_keys`. Never removes anything; reports
  stories not automated yet (shown as uncovered in the report) and test-case keys with no
  story tag on their describe.
- **`local-env-bootstrap`** — step-by-step local setup/troubleshooting: dependencies,
  bringing up `loan-webapp`/`lending-webapp` (Docker Compose or individually), mTLS cert
  conversion, env file creation from `.example.env`, ending in a `@SmokeTest` run to
  confirm the environment itself (vs. test/app code) is the problem when something fails
  before reaching the browser.
- **`test-data-reset`** — resets the shared `loans.json` / `loan-approvers.json` (both
  apps' entire data store, no DB) to the checked-in blank baseline at `apps/data/seed/`
  (empty arrays), matching the "always assume blank/fresh state" assumption
  `playwright-test-planner` writes test plans against. Detects the run mode first: under
  Docker Compose the live data is in the `shared_data` named volume (`/app/data`), so it
  copies into the container with `docker compose cp`; locally it copies the host files.
  Also supports the reverse (capture current state as the new baseline). Not wired into
  `npx playwright test` itself — callers (`test-case-executor`, `test-orchestrator`) run
  it before tests. (`tests/seed.spec.ts` is the Playwright planner/generator seed file,
  not a reset mechanism.)
