# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Running Tests

```bash
# Run all tests
npm test

# Visible browser, debug, UI mode
npm run test:headed
npm run test:debug
npm run test:ui
npm run test:chromium

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
```

Both apps use HTTPS with mTLS. They share `apps/data/loans.json` via a Docker volume (`shared_data`).

### Environment Setup

Tests require an environment file at repo root. Key variables:

| Variable | Purpose |
|---|---|
| `LOAN_APP_URL` / `LENDING_APP_URL` | App base URLs |
| `LOAN_CERT_P12_BASE64` / `LENDING_CERT_P12_BASE64` | Base64-encoded PKCS#12 cert for mTLS |
| `SMTP_*` | Email report delivery |
| `JIRA_*` / `XRAY_*` | Xray test result upload |
| `DB_*` | PostgreSQL connection |

## Architecture

### Multi-App vs Single-App Mode

The framework supports both modes through a **unified fixture** (`tests/fixtures/base.ts`):

- **Single-app**: uses standard `page` / `context` fixtures (backward-compatible)
- **Multi-app**: uses `apps` fixture — a `Record<appKey, AppContext>` where each app gets its own isolated browser context, page, and API context with its own certificate

The `apps` object is keyed by app names from `apps.config.json` (e.g. `apps['loan-app'].page`).

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
| `custom-reporter.ts` | `reports/coverage-report.html` (maps tests to epics via `feature_mapping.csv`) |
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

### Custom Subagents (`.claude/agents/`)

Project subagent names use **hyphens, not underscores** (`jira-story-reader`, not
`jira_story_reader`) — matches the convention of this repo's other agents
(`playwright-test-generator`, `playwright-test-healer`, `playwright-test-planner`). Keep
new agents consistent with this.

- **`jira-story-reader`** — pulls a Jira issue's summary, description, acceptance
  criteria, comments, linked issues, and attachments into `requirements/context-<KEY>.md`,
  downloading attachments to `requirements/<KEY>/attachments/` (gitignored). Talks to
  Jira through the `jira` MCP server (`.mcp.json` at repo root — the Claude Code CLI only
  reads project MCP servers from there; `.vscode/mcp.json` is a separate copy for the VS
  Code extension's own MCP integration and must be kept in sync manually if used) →
  `scripts/jira-mcp-server.js`, wrapping `uvx mcp-atlassian`. Reuses this repo's
  `JIRA_BASE_URL` / `JIRA_USER_EMAIL` / `JIRA_API_TOKEN` env vars (mapped to the
  `JIRA_URL` / `JIRA_USERNAME` / `JIRA_API_TOKEN` names that server expects).
  `JIRA_API_TOKEN` is a plain personal API token from
  `id.atlassian.com/manage-profile/security/api-tokens` — `JIRA_XRAY_API_TOKEN` is
  Xray-scoped and does not authenticate against the standard Jira REST API. Requires
  `uvx` (Python `uv`) installed locally. Invoke with a Jira issue key, e.g. "use
  jira-story-reader on SCRUM-123".
- **`code-review`** — read-only review of staged/unstaged Playwright/TypeScript E2E
  changes (`tests/**`, `utils/**`, `playwright.config.ts`) against
  `.claude/agents/playwright-ts-guidelines.md`, producing severity-tagged
  (Blocker/Major/Minor/Nit) markdown comments. Never edits files.
  Sources the diff from `git diff HEAD` (covers staged + unstaged in one pass) plus
  direct reads of untracked new files.
- **`code-refactor`** — turns violations into an approved-then-applied refactor. Builds a
  numbered plan (diffs, rationale, risk) and stops for explicit user approval before any
  `Edit`/`Write` call; only applies on a resumed invocation that contains explicit
  approval language. Two modes: STANDALONE (scans git-changed E2E files itself) and
  REVIEW-DRIVEN (takes `code-review`'s output as input). Shares the same
  `playwright-ts-guidelines.md` checklist as `code-review` — update that file, not either
  agent's own copy, when Playwright/TS conventions change.
- **`test-case-creator`** — turns each scenario in a test plan (from
  `playwright-test-planner`, saved under `specs/`) into an Xray Test issue: structured
  Step/Data/Expected-Result rows, an "is a test for" link to a Jira User Story, mandatory
  project fields filled, transitioned to Done. Same plan → approve → apply protocol as
  `code-refactor`, one approval covering the whole per-test-case pipeline. The `jira` MCP
  server runs `--read-only`, so this agent uses it only for lookups (issue type, required
  fields, link types, transitions) — actual creates/links/steps/transitions go through
  direct REST calls with the same auth patterns already established in
  `utils/xray-upload.ts` (Basic `JIRA_USER_EMAIL`/`JIRA_API_TOKEN` for standard issue
  ops, Bearer `JIRA_XRAY_API_TOKEN` for Xray's step endpoints).
- **`create-pull-request`** — branches, commits, and raises a PR for E2E changes (or
  pushes a follow-up commit to an already-open PR after review feedback). Same
  plan → approve → apply protocol; never operates directly on `main`, never force-pushes.
- **`test-case-executor`** — runs the Playwright test(s) for a given Jira/Xray test case
  (`npx playwright test --grep "@<KEY>"`) then records PASS/FAIL and attaches the HTML
  report via the existing `npm run xray:upload` script — doesn't reimplement Xray upload,
  reuses `utils/xray-upload.ts`. No approval gate; mirrors what CI already does
  automatically after a run.
- **`test-orchestrator`** — single entry point for E2E test automation requests.
  Classifies the request into one of 8 fixed intents (NEW TESTS, UPDATE PLAN, FIX TESTS,
  EXPLORE APPS, REGENERATE SPEC, READ STORY, CREATE TEST CASES, EXECUTE TEST CASE),
  announces the detected intent and route before invoking anything, then either
  delegates to one targeted agent or runs the full NEW TESTS pipeline: `jira-story-reader`
  → `playwright-test-planner` → (checkpoint) → `playwright-test-generator` →
  `playwright-test-healer` → `code-review` (→ `code-refactor` if issues) →
  `create-pull-request` → (checkpoint: PR feedback) → `test-case-creator` → (checkpoint)
  → `test-case-executor` → summary. Because a sub-agent can't pause mid-run for real
  human input, every checkpoint works by the orchestrator stopping and returning control,
  to be resumed via `SendMessage` once the user responds — the same mechanic
  `code-refactor`/`test-case-creator` use for their own plan → approve → apply, just
  spanning a longer pipeline with more stops.

### Custom Skills (`.claude/skills/`)

- **`api-contract-validator`** — generates API-only Playwright specs
  (`tests/apps/<app-name>/api/*.api.spec.ts`, tagged `@ApiContract`) that assert a
  running backend matches its OpenAPI/Swagger contract (status codes, required response
  fields, auth). **No spec exists in this repo yet** — the skill checks
  `backend-api/openapi.{yaml,json}` (and a broader fallback search) and reports a clear
  no-op if nothing's found, rather than guessing at a contract. Reuses the `apps` fixture's
  existing per-app `apiContext` (`tests/fixtures/base.ts`) — for this repo's mTLS-based
  apps specifically, the auth check is a with-cert-vs-without-cert pair rather than a
  bearer-token check, since OpenAPI security schemes don't model mTLS well.
- **`jira-xray-diagnostics`** — fixed diagnostic sequence for "jira MCP tools not
  showing up" / "Jira or Xray calls return nothing" problems: config location
  (`.mcp.json` at root vs. `.vscode/mcp.json`), which token is being used for which auth
  scheme (`JIRA_API_TOKEN` Basic auth vs. `JIRA_XRAY_API_TOKEN` Bearer/raven-only), live
  `/rest/api/3/myself` and `/project/search` checks to tell "invalid token" apart from
  "genuine permissions gap", and the `uv`/OneDrive hardlink fix. Use before assuming a
  Jira/Xray failure is a permissions issue.
- **`feature-mapping-sync`** — scans `tests/apps/**/*.spec.ts` for `@SCRUM-XXX`-style
  tags missing from `feature_mapping.csv` (which drives `utils/custom-reporter.ts`'s
  coverage report) and adds the missing rows directly. Run after generating new specs
  (e.g. via `test-orchestrator`'s NEW TESTS pipeline) so coverage reporting doesn't
  silently go stale.
- **`local-env-bootstrap`** — step-by-step local setup/troubleshooting: dependencies,
  bringing up `loan-webapp`/`lending-webapp` (Docker Compose or individually), mTLS cert
  conversion, env file selection, ending in a `@SmokeTest` run to confirm the environment
  itself (vs. test/app code) is the problem when something fails before reaching the
  browser.
- **`test-data-reset`** — resets the shared `apps/data/loans.json` /
  `loan-approvers.json` (both apps' entire data store, no DB) to a checked-in blank
  baseline at `apps/data/seed/`, matching the "always assume blank/fresh state"
  assumption `playwright-test-planner` already writes test plans against. Also supports
  the reverse (capture current state as the new baseline). `tests/seed.spec.ts` is an
  earlier unfinished attempt at this — this skill's reset step is the intended
  replacement/backing for it, not wired into the test run automatically.

### Tags Convention

- `@SmokeTest` — fast, critical-path tests
- `@Regression` — full regression suite
- `@MultiApp` — requires multi-app `apps` fixture
- `@LoanApproval` — E2E cross-app loan approval workflow
- `@SCRUM-XXX` — Jira ticket reference (used by Xray upload)
- `@ApiContract` — API-only contract tests generated by the `api-contract-validator`
  skill (reserved; no tests carry this tag yet since no OpenAPI spec exists)
