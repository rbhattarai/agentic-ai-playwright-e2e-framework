---
name: test-results-triage
description: Triages a Playwright run from reports/results.json — lists failing and flaky tests with the failed step, error, and artifacts (trace/screenshot/video), classifies each failure (environment, test-data, locator/UI change, assertion/app behavior, flaky), and routes it to the right fix (local-env-bootstrap, test-data-reset, playwright-test-healer, or a human for a likely app bug). Use after any test run that failed, when asked "why did the tests fail", before healing tests, or when a test passed only on retry. Called by test-orchestrator (FIX TESTS route, heal failures) and test-case-executor (on FAIL).
---

<!-- Single source of truth for this skill. GitHub Copilot loads it through
     .github/skills/test-results-triage/SKILL.md — keep instructions here harness-neutral. -->

Turns a Playwright run into a short, categorized failure list with a recommended next
action per failure, so callers don't "heal" a test that actually failed because the app
was down, the data was dirty, or the app has a real bug. Read-only — never edits tests,
data, or config.

## 1. Make sure there's a report

The JSON reporter (`playwright.config.ts`) writes `reports/results.json` on every run.
If it's missing, or older than the run being asked about, run the tests first (the
caller usually has just done so). Note: Playwright's HTML reporter wipes `reports/` at
the start of each run, so the report always reflects the most recent run only.

## 2. Summarize

```bash
node .claude/skills/test-results-triage/scripts/summarize-results.cjs            # human-readable
node .claude/skills/test-results-triage/scripts/summarize-results.cjs --json     # for programmatic use
```

Optional first argument: a different report path. The script prints overall stats, any
run-level (global) errors, and one block per failing/flaky test: category, title,
file:line, tags (incl. `@SCRUM-XXX`), attempts, failed step (the `stepWithScreenshot`
step name), first lines of the error, and artifact paths.

## 3. Confirm the category

The script pre-classifies by error text; sanity-check it against the error and, when
useful, the artifacts (screenshot first, then trace via `npx playwright show-trace
<trace.zip>` if a human wants to look). Override the script's category if the evidence
says otherwise — and say you did.

| Category | Typical signals | Next action |
|---|---|---|
| `environment` | `ECONNREFUSED`, `net::ERR_*`, cert/TLS/PKCS#12 errors, browser executable missing, missing env file/var, run-level global errors | Run the **`local-env-bootstrap`** skill. Don't touch test code. |
| `test-data` | Strict-mode violation (`resolved to N elements`) on rows, duplicates, unexpected existing records | Run the **`test-data-reset`** skill, then re-run the test once. |
| `locator-or-ui-change` | Locator action timeouts, element not found/not visible, detached elements | Hand to the **`playwright-test-healer`** agent with the test file, failed step, and error. |
| `assertion-or-app-behavior` | Value mismatch (`Expected`/`Received`) on status text, counts, URLs | Possibly a **real app bug** — report it to the user with expected vs. received; don't auto-heal the assertion away. Heal only if the user confirms the app behavior changed intentionally. |
| `flaky` | Failed, then passed on retry (CI runs `retries: 1`) | Report as flaky with the failing attempt's error; suggest a fix (web-first assertions, no fixed waits — see `docs/playwright-ts-guidelines.md`) rather than ignoring it. |
| `unknown` | Nothing matched | Show the error and artifacts; ask the user rather than guessing. |

A cascade is common: one `environment` failure can surface as many locator timeouts.
If several tests fail and any is `environment`, fix that first and re-run before
triaging the rest.

## 4. Report

Concise table: test (file:line), category, failed step, one-line error, recommended next
action. Then overall stats (passed/failed/flaky/skipped). If called by an agent, return
the table — let the caller decide whether to run the next action.
