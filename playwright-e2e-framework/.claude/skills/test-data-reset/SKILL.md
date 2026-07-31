---
name: test-data-reset
description: Resets the shared apps/data/*.json state (loans.json, loan-approvers.json) that both sample apps read/write, back to a clean baseline. Use when tests fail due to leftover state from previous runs (e.g. an earlier test's loan data still present), before a test run that assumes fresh state, or to establish/update the checked-in baseline snapshot.
---

`apps/loan-webapp` and `apps/lending-webapp` share `apps/data/loans.json` and
`apps/data/loan-approvers.json` as their entire data store (flat JSON files, no DB) —
mutated directly by both apps and kept in sync live via the SSE/webhook mechanism in
`apps/*/src/events.ts`. There's no reset step currently: `tests/seed.spec.ts` exists as
an empty, unimplemented stub, and the live data files accumulate every loan/approver
created across every manual and automated run. `playwright-test-planner`'s own
instructions already assume "blank/fresh state" for every scenario — this skill is what
makes that assumption true.

## 1. Baseline convention

Checked-in baseline snapshots live at `apps/data/seed/loans.json` and
`apps/data/seed/loan-approvers.json`. If these don't exist yet, create them as empty
arrays (`[]`) — matches the "always assume blank/fresh state" assumption
`playwright-test-planner` already writes test plans against. Don't seed them with
sample records unless the user specifically wants a non-empty baseline (ask if a request
implies one, e.g. "reset to include a default approver").

## 2. Reset

```bash
cp apps/data/seed/loans.json apps/data/loans.json
cp apps/data/seed/loan-approvers.json apps/data/loan-approvers.json
```

Safest when both apps are stopped (avoids a write racing the copy) — if running via
Docker Compose, this is a good moment to mention that but not force a restart
unprompted; a live app will simply pick up the reset file on its next read in this
app's read-per-request model.

## 3. Capture a new baseline (opposite direction)

If asked to make the *current* live state the new baseline instead of resetting to the
existing one:
```bash
cp apps/data/loans.json apps/data/seed/loans.json
cp apps/data/loan-approvers.json apps/data/seed/loan-approvers.json
```
Confirm this is really what's wanted first — it overwrites the previous baseline
(recoverable via git if already committed, lost if not).

## 4. Report

Which direction ran (reset-to-baseline vs. capture-new-baseline), and a quick diff
summary — record counts before/after is usually enough (`jq length
apps/data/loans.json`), not a full dump.

## Optional: wiring into the test run itself

`tests/seed.spec.ts` is an empty stub that looks like an earlier attempt at this. Rather
than duplicating reset logic inside a Playwright test, point it (or a
`playwright.config.ts` `globalSetup`) at this same reset step — but only do this if
asked to; wiring it in changes what *every* test run does by default, which is worth a
explicit decision, not a silent side effect of running this skill once.
