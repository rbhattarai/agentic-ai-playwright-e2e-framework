---
name: test-data-reset
description: Resets the shared loans.json / loan-approvers.json state that both sample apps read/write back to a clean baseline (apps/data/seed/), in whichever mode the apps run — Docker Compose (named volume) or local npm. Use before a test run that assumes fresh state, when tests fail due to leftover state from previous runs (duplicate/unexpected rows, strict-mode violations on rows), or to capture the current state as a new baseline. Called automatically by test-case-executor and test-orchestrator before running tests.
---

<!-- Single source of truth for this skill. GitHub Copilot loads it through
     .github/skills/test-data-reset/SKILL.md — keep instructions here harness-neutral. -->

`apps/loan-webapp` and `apps/lending-webapp` share `loans.json` and `loan-approvers.json`
as their entire data store (flat JSON arrays, no DB), mutated directly by both apps and
kept in sync live via the SSE/webhook mechanism in `apps/*/src/events.ts`. Data
accumulates across every manual and automated run. `playwright-test-planner` writes
every plan assuming a blank/fresh state — this skill is what makes that assumption true.

**Where the live data actually is depends on how the apps run:**

| Mode | Live data location |
|---|---|
| Docker Compose (`apps/docker-compose.yml`) | Named volume `shared_data`, mounted at `/app/data` in both containers — **not** the host's `apps/data/` |
| Local (`npm run dev` / `npm start` per app) | Host files `apps/data/loans.json`, `apps/data/loan-approvers.json` |

Copying host files does nothing to a running Docker stack, and vice versa — always detect
the mode first.

## 1. Baseline

Checked-in baseline snapshots: `apps/data/seed/loans.json` and
`apps/data/seed/loan-approvers.json` (empty arrays `[]` by default, matching the
blank-state assumption). If missing, recreate them as `[]`. Don't seed them with sample
records unless the user specifically asks for a non-empty baseline.

## 2. Detect the mode

```bash
docker compose -f apps/docker-compose.yml ps --services --status running 2>/dev/null
```

- Lists `loan-webapp` and/or `lending-webapp` → **Docker mode**.
- Empty output or `docker` not installed → **Local mode**.

## 3. Reset to baseline

**Docker mode** — copy into the shared volume through a running container (one copy is
enough, the volume is shared):

```bash
docker compose -f apps/docker-compose.yml cp apps/data/seed/loans.json loan-webapp:/app/data/loans.json
docker compose -f apps/docker-compose.yml cp apps/data/seed/loan-approvers.json loan-webapp:/app/data/loan-approvers.json
```

**Local mode:**

```bash
cp apps/data/seed/loans.json apps/data/loans.json
cp apps/data/seed/loan-approvers.json apps/data/loan-approvers.json
```

Both apps read the files per request, so a running app picks up the reset immediately —
no restart needed. Note: the host `apps/data/*.json` files are tracked in git, so a
local-mode reset shows up as a diff there; don't commit that diff as part of test work.

## 4. Capture a new baseline (opposite direction)

Only when explicitly asked to make the *current* live state the new baseline — confirm
first, since it overwrites the previous baseline:

```bash
# Docker mode
docker compose -f apps/docker-compose.yml cp loan-webapp:/app/data/loans.json apps/data/seed/loans.json
docker compose -f apps/docker-compose.yml cp loan-webapp:/app/data/loan-approvers.json apps/data/seed/loan-approvers.json
# Local mode
cp apps/data/loans.json apps/data/seed/loans.json
cp apps/data/loan-approvers.json apps/data/seed/loan-approvers.json
```

## 5. Report

Mode detected (Docker/local), direction (reset vs. capture), and record counts before →
after for each file (`node -e "console.log(require('./apps/data/loans.json').length)"`
for local; `docker compose -f apps/docker-compose.yml exec loan-webapp cat /app/data/loans.json`
piped to a count for Docker) — not a full dump.

## Not wired into `playwright test` itself

`tests/seed.spec.ts` is an empty generated stub (Playwright's planner/generator seed
file), not a reset mechanism. Resetting is done by callers of this skill
(`test-case-executor`, `test-orchestrator`) before they run tests, not by a
`globalSetup` — wiring it into every `npx playwright test` run would change what every
run does by default, which is worth an explicit decision.
