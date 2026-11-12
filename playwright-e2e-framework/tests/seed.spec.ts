/**
 * Seed test for the Playwright test agents (playwright-test-planner / -generator / -healer).
 *
 * The agents run this test via the playwright-test MCP server (`planner_setup_page`,
 * `generator_setup_page`), then explore and record from the page it leaves behind; generated
 * specs follow its imports. It uses this repo's fixtures (tests/fixtures/base), so the
 * built-in `page` already carries mTLS client certificates for every app in
 * apps.config.json — agents can navigate from here to any app (e.g. LENDING_APP_URL).
 *
 * Tagged @seed and excluded from normal runs via `--grep-invert @seed` in the npm test
 * scripts and run_test.sh (not in playwright.config.ts — that would hide it from the agents).
 * A bare `npx playwright test` still runs it; it just opens the Loan App and passes.
 */
import { test } from './fixtures/base';

test('seed @seed', async ({ page }) => {
  await page.goto(process.env.LOAN_APP_URL!);
});
