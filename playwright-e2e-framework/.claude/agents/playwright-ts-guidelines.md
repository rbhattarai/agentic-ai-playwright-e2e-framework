# Playwright / TypeScript E2E Guidelines

Shared checklist and severity rubric for this repo's Playwright + TypeScript E2E code
(page objects, spec files, locators, dialogs, helpers). Used by both the `code-review`
and `code-refactor` agents — keep this the single source of truth; don't fork copies
into either agent file.

## Checklist

Only flag issues on changed/added lines (or existing lines a change now conflicts with)
— not pre-existing unrelated code encountered while reading for context.

**Page objects** (`tests/pages/*.ts`, `tests/apps/*/pages/*.ts`)
- Extends `BasePage`, constructor signature `(page: Page, baseUrl: string)`.
- Locators are `readonly` class fields defined once, not re-built as string literals
  inside multiple methods.
- Methods describe user intent ("openNewLoanModal") not raw Playwright calls
  ("clickButton").
- Assertions (`expect(...)`) generally belong in spec files, not page objects — page
  objects drive interaction and expose state, not verify it. Flag as Minor if crossed,
  not Blocker (some visibility waits before interacting are legitimate).
- Locator strings are reasonably stable (role/text/testid/data attributes, or this
  repo's row-locator pattern) — flag brittle `nth-child`/absolute-index selectors that
  will break on reorder.

**Spec files** (`tests/apps/**/*.spec.ts`)
- Imports `test`/`expect` from `../../fixtures/base` (or the correct relative path to
  it), not raw `@playwright/test`, unless there's a reason not to need fixtures.
- Each `test.describe` carries the tag(s) it needs per the Tags Convention
  (`@SmokeTest`, `@Regression`, `@MultiApp`, `@LoanApproval`, `@SCRUM-XXX`) — flag
  missing tags on new test blocks, especially `@MultiApp` when the test uses `apps`.
- Steps are wrapped in `stepWithScreenshot(test, '...', page, async () => {...})` per
  the project convention, not bare `test.step` or un-stepped inline code.
- Multi-app tests guard on `apps['x']` existing and `test.skip` gracefully if not
  configured, matching the established pattern.
- No `test.only` / `test.skip` left in committed code (accidental focus/skip).
- No `page.waitForTimeout()` / arbitrary sleeps — use web-first `expect(locator)...`
  assertions or `waitForSelector` tied to real state instead.
- No floating promises — every `page.*` / `expect(...)` call that returns a promise is
  `await`ed.
- Tests don't depend on execution order or mutate shared state without going through a
  fixture — each test should be independent.
- No hardcoded secrets/credentials/URLs that should come from env vars or
  `apps.config.json`.

**Locators / "elements"**
- No duplicated locator strings across files — should live in one page object.
- Locators aren't so generic they risk multi-element matches (missing `.first()`/scoping
  where genuinely ambiguous, but don't flag `.first()` used to paper over a locator that
  should just be scoped better — call that out instead).

**Dialogs**
- `page.on('dialog', ...)` is registered before the action that triggers it.
- Every dialog handler calls `accept()` or `dismiss()` — an unhandled dialog hangs the
  test/suite.

**Helpers** (`tests/helpers/*.ts`, `utils/*.ts`)
- `DBHelper` stays a singleton via `getInstance()` — flag new direct `new DBHelper()`
  or new ad-hoc `pg` pools.
- DB connections/results are released/cleaned up, not leaked.
- Exported functions have explicit parameter/return types where not trivially inferred.

**TypeScript**
- No `any` (or `as any`) without a comment explaining why it's unavoidable.
- No non-null assertions (`!`) on values that can plausibly be null/undefined here.
- No unused imports/variables.
- Imports use the path aliases (`@helpers/*`, `@fixtures/*`) instead of deep relative
  paths (`../../../helpers/...`) when an alias covers the target.
- Naming: PascalCase classes/page objects, camelCase methods/variables/functions, file
  name matches the class it exports (`LoanAppPage.ts` → `LoanAppPage`).

## Severity rubric

- **Blocker** — will cause flaky/incorrect test results, hangs the suite, or leaks a
  secret. Must fix before merge.
- **Major** — breaks an established project convention or a real Playwright/TS best
  practice; likely maintenance pain or intermittent flakiness.
- **Minor** — style/consistency deviation, unlikely to cause failures.
- **Nit** — cosmetic, optional.
