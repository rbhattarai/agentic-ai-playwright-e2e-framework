---
name: local-env-bootstrap
description: Sets up or troubleshoots a local dev environment for this repo — dependencies, sample-app certs, Docker Compose apps, env files — then verifies with a smoke test. Use when asked to set up the project locally, when tests fail before even reaching the browser (connection refused, cert errors, missing env vars), or when a fresh clone/machine needs to run tests for the first time.
---

Gets a fresh checkout of this repo to the point where `npx playwright test --grep
"@SmokeTest"` passes, or pinpoints exactly which step is broken. The pieces (cert
conversion, env loading, Docker Compose) are individually documented across `README.md`
and `run_test.sh`, but not as one troubleshooting sequence — this is that sequence.

## 1. Prerequisites

```bash
node -v && npm -v && docker --version
```

Node/npm are required always; Docker only if running the sample apps via Compose (§3,
recommended path). Missing Docker isn't fatal — apps can run individually via `npm run
dev` instead.

## 2. Install dependencies

```bash
npm install
npx playwright install
```

If sample apps will run outside Docker too: `cd apps/loan-webapp && npm install` and
same for `apps/lending-webapp` (they have their own `package.json`s, separate from root).

## 3. Bring up the sample apps

Recommended — Docker Compose (handles the shared `apps/data` volume and inter-container
URLs automatically):

```bash
cd apps && docker compose up --build
```

Without Docker — run each individually (two terminals):
```bash
cd apps/loan-webapp && npm run dev       # https://localhost:3000
cd apps/lending-webapp && npm run dev    # https://localhost:3001
```
Without Docker, `apps/data/*.json` isn't a shared volume — both processes read/write the
same local files directly, which works for local dev but skip the Docker-service-name
webhook URLs (`LOAN_WEBAPP_URL`/`LENDING_WEBAPP_URL` env vars fall back to `localhost`).

Verify both are actually serving before moving on:
```bash
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:3000
curl -sk -o /dev/null -w "%{http_code}\n" https://localhost:3001
```
(`-k` because these are self-signed certs — expect `200`, not a connection error.)

## 4. Certificates (mTLS)

Both apps require client certs for Playwright to connect. `certs/` holds `.p12` files;
`LOAN_CERT_P12_BASE64`/`LENDING_CERT_P12_BASE64` env vars hold the **password** for
those files (not the cert itself — despite the name, base64 there is the encoded
password: `echo -n "your_password" | base64`). `run_test.sh` / `scripts/convert-certs.sh`
auto-converts `.p12` → PEM at runtime.

If tests fail with cert errors: confirm `.p12` files exist in `certs/` and their names
match the `match` glob/regex in `apps.config.json`'s `certConfig.profiles`, then:
```bash
openssl x509 -in certs/cert.pem -noout -dates   # check expiry, once converted
```

## 5. Env file

Copy the right one for the target environment (`.dev.env`, `.qa.env`, ...) — see
`CLAUDE.md`'s Environment Setup table for the required variables. Missing `APP_URL` /
`LOAN_APP_URL` / `LENDING_APP_URL` is the most common first-run failure; `playwright.config.ts`
falls back from `.${ENV}.env` to `.env` with a console warning if the expected file isn't
found — check for that warning in test output if things look unconfigured.

## 6. Smoke test

```bash
./run_test.sh -env=dev -tags=@SmokeTest
```
or directly: `npx playwright test --grep "@SmokeTest"`. A pass here means the
environment is sound; a failure here (vs. a failure in a feature-specific test) means the
problem is environmental, not the test/app code — go back to whichever of §3-§5 matches
the actual error (connection refused → §3, cert → §4, missing/wrong URL → §5).
