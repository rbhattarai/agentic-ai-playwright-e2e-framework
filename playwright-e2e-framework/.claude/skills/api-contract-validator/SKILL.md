---
name: api-contract-validator
description: Generates API-level E2E Playwright specs that validate backend REST contract compliance (status codes, response shapes, required fields, auth) from an OpenAPI/Swagger spec. No spec exists in this repo yet — this skill is a documented no-op until one is placed at the conventions below. Use when asked to validate API contracts, generate API tests from swagger/OpenAPI, or check backend REST compliance.
---

Generates Playwright API-only specs (`request`/`apiContext`, no browser) that assert a
running backend matches its OpenAPI/Swagger contract: status codes, response shape
(required fields present, correct types), and auth behavior.

**Current state: no OpenAPI/Swagger spec exists anywhere in this repo** (verified —
no `backend-api/` folder, no `swagger`/`openapi` references, no codegen tooling in
`package.json`). This skill does nothing destructive when that's true — it reports the
gap clearly and stops. Everything below only activates once a spec exists.

## 1. Locate the spec

Accept an explicit path via `args` if given. Otherwise search, in order:

1. `backend-api/openapi.yaml` / `backend-api/openapi.yml` / `backend-api/openapi.json`
   (the documented convention for this repo — create `backend-api/` at the repo root if
   establishing this for the first time)
2. `backend-api/swagger.yaml` / `backend-api/swagger.json`
3. Any `openapi.{yaml,yml,json}` / `swagger.{yaml,yml,json}` elsewhere in the repo
   (`Glob` for it), excluding `node_modules`.

If nothing is found: report exactly that (checked locations, found nothing) and stop.
Do not fabricate endpoint shapes, guess at a contract, or generate specs against
assumptions — a wrong generated "contract test" is worse than none, since it would pass
or fail for reasons unrelated to the real backend.

## 2. Generate/refresh TypeScript models

If `openapi-typescript` isn't a devDependency yet, ask before adding it (`npm install
--save-dev openapi-typescript`) — don't silently modify `package.json`. Once available:

```bash
npx openapi-typescript backend-api/openapi.yaml -o backend-api/generated/schema.d.ts
```

Regenerate this on every run — it's a derived artifact. Add a header comment to
generated files: `// AUTO-GENERATED — do not hand-edit; rerun the api-contract-validator
skill to refresh.` Add `backend-api/generated/` to `.gitignore` unless the user wants
generated models committed (ask if unclear).

## 3. Map the spec to test cases

For every path + method in the spec:

- **Status codes** — one assertion per documented response code (the happy-path 2xx, and
  documented error codes like 400/404 where the spec defines a triggering condition you
  can actually construct, e.g. a required field spec says is missing → expect the
  documented 400, not just the 2xx path).
- **Response shape** — for each field the schema marks `required`, assert it's present in
  the response body with the right JS type (`typeof` checks against the schema's
  `type`). Prefer plain hand-written assertions over pulling in a JSON-schema validator
  library (`ajv` etc.) — this keeps generated specs dependency-light and readable; only
  suggest adding one if the user later asks for stricter validation than field-presence
  and type-checking.
- **Auth** — read the spec's `security`/`securitySchemes` for the endpoint:
  - `http bearer` / `apiKey` schemes: one test with a valid credential (expect success
    per spec) and one without (expect the spec's documented 401/403).
  - This repo's actual apps authenticate via **mTLS client certificates**
    (`apps.config.json`), which OpenAPI's security schemes don't model well. For these,
    don't rely on the spec's `security` block — instead generate a with-cert vs.
    without-cert pair directly: reuse `apps[appKey].apiContext` (already configured with
    the client cert, per `tests/fixtures/base.ts`) for the positive case, and a second,
    plain `request.newContext({ baseURL, ignoreHTTPSErrors: true })` **without**
    `clientCertificates` for the negative case, asserting the backend rejects it.

## 4. Generate the spec files

- Location: `tests/apps/<app-name>/api/<resource>.api.spec.ts` (parallel to the existing
  `tests/apps/<app-name>/pages/` convention — API specs live alongside that app's other
  test code, not mixed into UI spec files).
- Import `test`/`expect` from `../../../fixtures/base` and use the `apps` fixture's
  `apiContext` — don't create a new ad-hoc fixture, this repo already has one per app
  with cert handling built in.
- Tag every generated `test.describe` with `@ApiContract` (new tag — add it to the Tags
  Convention table in `CLAUDE.md` if not already there) plus the owning app's tag
  convention, so `npx playwright test --grep "@ApiContract"` runs just these.
- Header comment marking the file as generated (same convention as the models) — these
  are regenerated from the spec, not hand-maintained; if a generated file needs custom
  logic beyond what the spec expresses, that's a signal to add an extension point (a
  separate hand-written spec file) rather than editing the generated one.

## 5. Report

Which spec was used, how many endpoints/operations were covered, how many spec files
were generated/updated, and any endpoints skipped with why (e.g. a response schema with
no `required` fields to assert, or a security scheme this skill doesn't know how to
exercise — call those out explicitly rather than silently emitting a weaker test).
