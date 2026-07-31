# Playwright E2E Test Automation Framework

A Playwright + TypeScript E2E framework with multi-app support, client certificate authentication, custom step-level reporting, and CI/CD integration.

## Table of Contents

- [Installation](#installation)
- [Sample Apps](#sample-apps)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Reporting](#reporting)
- [CI/CD Integration](#cicd-integration)
- [Project Structure](#project-structure)
- [Troubleshooting](#troubleshooting)

---

## Installation

```bash
npm install
npx playwright install
```

---

## Sample Apps

Two Express/TypeScript sample apps live under `apps/`. They share a flat JSON data store (`apps/data/`) and communicate via Webhook + SSE for real-time UI sync.

```bash
# Run both together (recommended)
cd apps
docker compose up --build

# Run individually for local dev
cd apps/loan-webapp && npm run dev     # https://localhost:3000
cd apps/lending-webapp && npm run dev  # https://localhost:3001
```

Both apps use HTTPS with mTLS. In Docker, shared data is persisted via the `shared_data` named volume.

### Real-time Cross-App Sync

After any write to `loans.json`, the originating app fires a `POST /notify` to the other app. The receiving app broadcasts a `loan-updated` SSE event to all connected browser tabs, which then reload automatically. Inter-container URLs use Docker service names and fall back to `localhost` for local dev.

---

## Configuration

### App Registry (`apps.config.json`)

All applications are declared centrally. `AppManager` (`utils/app-manager.ts`) resolves `${ENV_VAR}` interpolation in `baseUrl` and builds per-app cert configs at startup.

```json
{
  "loan-app": {
    "name": "Loan Application",
    "baseUrl": "${LOAN_APP_URL}",
    "defaultCertProfile": "default-loan",
    "certConfig": {
      "enabled": true,
      "profiles": {
        "default-loan": {
          "type": "p12-to-pem",
          "certAlias": "default",
          "match": {
            "type": "glob",
            "value": "cn=aosqa.p*"
          },
          "passwordEnvVar": "LOAN_CERT_P12_BASE64",
          "metadata": {
            "role": "admin"
          }
        }
      }
    },
    "description": "Main loan management application"
  },
  "lending-app": {
    "name": "Lending Application",
    "baseUrl": "${LENDING_APP_URL}",
    "defaultCertProfile": "default-lending",
    "certConfig": {
      "enabled": true,
      "profiles": {
        "default-lending": {
          "type": "p12-to-pem",
          "certAlias": "default",
          "match": {
            "type": "glob",
            "value": "cn=aosqa.p*"
          },
          "passwordEnvVar": "LENDING_CERT_P12_BASE64",
          "metadata": {
            "role": "admin"
          }
        }
      }
    },
    "description": "Lending application for approvals"
  }
}
```

#### Certificate Configuration Options

**`p12-to-pem`** — auto-converts a PKCS#12 file to PEM at runtime:
```json
"profiles": {
  "admin": {
    "type": "p12-to-pem",
    "certAlias": "admin",
    "match": { "type": "glob", "value": "cn=*_admin.p*" },
    "passwordEnvVar": "LOAN_CERT_P12_BASE64",
    "metadata": { "role": "admin" }
  }
}
```

**`custom-pem`** — uses pre-existing PEM cert/key files:
```json
"profiles": {
  "default": {
    "type": "custom-pem",
    "certAlias": "default",
    "certPath": "${LENDING_CERT_PATH}",
    "keyPath": "${LENDING_KEY_PATH}",
    "passwordEnvVar": "LENDING_CERT_PASSWORD"
  }
}
```

**Disabled** — for apps that don't require a client certificate:
```json
"certConfig": { "enabled": false }
```

Field notes:
- `defaultCertProfile` — profile used when no explicit profile is specified on the CLI
- `certAlias` — stable internal identifier used for generated PEM filenames
- `match.type` — supports `exact`, `glob`, and `regex`
- `metadata` — optional; can carry arbitrary fields (`role`, `channel`, etc.)
- `${ENV_VAR}` syntax in `baseUrl`, `certPath`, and `keyPath` is resolved from the loaded env file

### Environment Files

Create `.dev.env`, `.qa.env`, or `.prod.env` at the repo root. Key variables:

```bash
# App URLs
LOAN_APP_URL=https://localhost:3000
LENDING_APP_URL=https://localhost:3001

# mTLS certificates (base64-encoded PKCS#12)
# To encode: echo -n "your_password" | base64
LOAN_CERT_P12_BASE64=<base64_password>
LENDING_CERT_P12_BASE64=<base64_password>

# Playwright
PLAYWRIGHT_HEADLESS=false

# SMTP (email reports)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your.email@gmail.com
SMTP_PASS=<base64_password>
REPORT_TO=recipient@example.com
REPORT_FROM=noreply@example.com

# Jira / Xray
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_USER_EMAIL=your.email@example.com
JIRA_XRAY_API_TOKEN=<api_token>
JIRA_PROJECT_KEY=SCRUM
XRAY_CA_PEM_BASE64=<base64_ca_cert>

# Database
DB_HOST=dev-db.example.com
DB_PORT=5432
DB_USER=db_user
DB_PASSWORD=<base64_password>
DB_NAME=postgres
```

### Certificate Files

Place `.p12` files in `certs/`. The framework auto-converts them to PEM at runtime. To extract manually:

```bash
openssl pkcs12 -in certs/my.p12 -clcerts -nokeys -out certs/cert.pem -passin pass:changeme -legacy
openssl pkcs12 -in certs/my.p12 -nocerts -nodes  -out certs/key.pem  -passin pass:changeme -legacy
```

---

## Running Tests

### Using `run_test.sh` (recommended)

Handles env loading, cert conversion, and multi-app browser context setup.

```bash
# E2E cross-app loan approval workflow
./run_test.sh -env=dev -tags=@LoanApproval

# All multi-app tests
./run_test.sh -apps=loan-app,lending-app -env=dev -tags=@MultiApp

# Full regression
./run_test.sh -env=qa -tags=@Regression
```

| Flag | Default | Description |
|---|---|---|
| `-env` | `dev` | Environment (`dev`, `qa`, `prod`) |
| `-tags` | `@SmokeTest` | Playwright `--grep` filter |
| `-apps` | all apps | Comma-separated app keys with optional `:profile` suffix |

### Using npm / npx directly

```bash
npm test                                        # All tests
npm run test:headed                             # Visible browser
npm run test:debug                              # Debug mode
npm run test:ui                                 # Playwright UI mode
npx playwright test --grep "@LoanApproval"      # By tag
npx playwright test tests/apps/loan-app/        # By folder
```

### Reports

```bash
npm run report          # Open Playwright HTML report (reports/)
npm run report:step     # Open step-level screenshot report (reports/step-report/index.html)
npm run send-report     # Email HTML report
npm run xray:upload     # Upload JUnit results to Jira Xray
```

---

## Writing Tests

### Multi-App Test (primary pattern)

```typescript
import { test, expect } from '../../fixtures/base';
import { LoanAppPage } from '../loan-app/pages/LoanAppPage';
import { LendingAppPage } from '../lending-app/pages/LendingAppPage';
import { stepWithScreenshot } from '@helpers/reporting';

test.describe('E2E Loan Approval @LoanApproval @MultiApp', () => {
  test('Full approval flow', async ({ apps }) => {
    if (!apps['loan-app'] || !apps['lending-app']) {
      test.skip(true, 'Both apps must be configured');
      return;
    }

    const loanApp = apps['loan-app'];
    const loanAppPage = new LoanAppPage(loanApp.page, loanApp.baseUrl);

    await stepWithScreenshot(test, 'Open loan webapp', loanApp.page, async () => {
      await loanAppPage.goto();
    });

    // ... more steps
  });
});
```

Each test step should be wrapped in `stepWithScreenshot` — it creates a named `test.step` and attaches a full-page screenshot captured in the step report.

### Page Object Model

All page objects extend `BasePage` (`tests/pages/BasePage.ts`) and receive `(page, baseUrl)`.

```typescript
import { Page, expect } from '@playwright/test';
import { BasePage } from '../../../pages/BasePage';

export class LoanAppPage extends BasePage {
  private readonly newLoanBtn = 'button[data-bs-target="#newLoanModal"]';

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
  }

  async openNewLoanModal() {
    await this.page.click(this.newLoanBtn);
    await this.page.waitForSelector('#newLoanModal.show');
  }
}
```

Row-locator pattern used throughout:
```typescript
page.locator('tbody tr', {
  has: page.locator('td:first-child span.badge', { hasText: loanId })
});
```

### Legacy Single-App Test (backward compatible)

```typescript
import { test, expect } from '../../fixtures/base';

test('Single-app test @SmokeTest', async ({ page }) => {
  await page.goto(process.env.APP_URL!);
  await expect(page.getByText('Welcome')).toBeVisible();
});
```

### Tags Convention

| Tag | Purpose |
|---|---|
| `@SmokeTest` | Fast, critical-path tests |
| `@Regression` | Full regression suite |
| `@MultiApp` | Requires `apps` fixture |
| `@LoanApproval` | E2E cross-app loan approval workflow |
| `@SCRUM-XXX` | Jira ticket reference (used by Xray upload) |

### Database Helper

```typescript
import { DBHelper } from '@helpers/DBHelper';

const result = await DBHelper.getInstance().executeQuery(
  'SELECT * FROM loans WHERE id = $1', [loanId]
);
expect(result.rows.length).toBe(1);
```

---

## Reporting

Six reporters run simultaneously:

| Reporter | Output |
|---|---|
| `list` | Console |
| `html` | `reports/index.html` |
| `json` | `reports/results.json` |
| `junit` | `reports/junit.xml` |
| `custom-reporter.ts` | `reports/coverage-report.html` (epic/feature mapping via `feature_mapping.csv`) |
| `step-report-reporter.ts` | `reports/step-report/index.html` (step screenshots, collapsible UI, lightbox) |

> The built-in HTML reporter wipes `reports/` in its `onEnd`. The step report reporter buffers all screenshot data in memory during the run and flushes to `reports/step-report/` only in its own `onEnd`, after the directory is recreated.

---

## CI/CD Integration

`.gitlab-ci.yml` defines stages: **validate → test → xray → notify**.

Modular scripts in `scripts/`:

| Script | Purpose |
|---|---|
| `parse-args.sh` | CLI arg parsing (`-env`, `-apps`, `-tags`) |
| `setup-env.sh` / `validate-env.sh` | Env file loading and validation |
| `convert-certs.sh` | Base64 p12 → PEM conversion |
| `multi-app-setup.sh` | Per-app browser context setup |
| `download-certs.sh` | CI certificate retrieval from GitLab Secure Files |
| `xray-upload-setup.sh` | CA cert setup for Xray upload |

### GitLab CI Variables

| Variable | Required | Description |
|---|---|---|
| `ENV` | Yes | Target environment (`dev`, `qa`, `prod`) |
| `TAG` | Yes | Test tags to run |
| `XRAY_CA_PEM_BASE64` | Yes | Base64 CA cert for Xray |
| `JIRA_XRAY_API_TOKEN` | Yes | Xray API token |
| `APPS` | No | Specific apps (empty = all from config) |
| `PLAYWRIGHT_HEADLESS` | No | Default: `true` in CI |

---

## Project Structure

```
playwright-e2e-framework/
├── apps.config.json                # Central app registry
├── playwright.config.ts
├── run_test.sh                     # Main test runner script
├── feature_mapping.csv             # Epic/feature mapping for coverage report
├── apps/                           # Sample test applications
│   ├── docker-compose.yml
│   ├── loan-webapp/                # Express/TS app (port 3000)
│   │   └── src/
│   │       ├── events.ts           # SSE + webhook logic
│   │       ├── server.ts
│   │       └── routes/
│   ├── lending-webapp/             # Express/TS app (port 3001)
│   │   └── src/
│   │       ├── events.ts
│   │       ├── server.ts
│   │       └── routes/
│   └── data/                       # Shared JSON data store
│       ├── loans.json
│       └── loan-approvers.json
├── certs/                          # Client certificates
├── scripts/                        # Modular bash scripts
├── utils/
│   ├── app-manager.ts
│   ├── app-helpers.ts
│   ├── custom-reporter.ts
│   ├── step-report-reporter.ts
│   ├── send-report-email.js
│   └── xray-upload.ts
├── tests/
│   ├── fixtures/base.ts            # Unified single + multi-app fixture
│   ├── helpers/
│   │   ├── DBHelper.ts
│   │   ├── TableHelper.ts
│   │   └── reporting.ts            # stepWithScreenshot() helper
│   ├── pages/BasePage.ts
│   └── apps/
│       ├── loan-app/pages/LoanAppPage.ts
│       ├── lending-app/pages/LendingAppPage.ts
│       └── e2e/                    # Cross-app workflow specs
│           └── e2e-loan-lending-approval.spec.ts
└── reports/                        # Generated test reports
    ├── index.html
    ├── coverage-report.html
    ├── results.json
    ├── junit.xml
    └── step-report/
        └── index.html
```

---

## Troubleshooting

**Certificate not found / conversion failed**
- Verify `.p12` file is in `certs/` and the name matches the `match` rule in `apps.config.json`
- Check password env var is correctly base64-encoded
- Inspect cert expiry: `openssl x509 -in certs/cert.pem -noout -dates`

**Environment variables not loaded**
- Ensure the correct env file exists (`.dev.env`, `.qa.env`, etc.)
- Use `./run_test.sh` rather than `npx playwright test` directly — it handles env loading

**Apps not available in tests**
- Validate `apps.config.json` is valid JSON: `cat apps.config.json | jq .`
- Check all `${ENV_VAR}` references in the config are set in the env file

**Step report screenshots missing**
- Always use `./run_test.sh` or `npx playwright test` — do not interrupt the run before `onEnd` completes
- Check `reports/step-report/assets/` exists after the run

**SSE / real-time sync not working in Docker**
- Ensure `LENDING_WEBAPP_URL` and `LOAN_WEBAPP_URL` are set in `apps/docker-compose.yml` using service names, not localhost
