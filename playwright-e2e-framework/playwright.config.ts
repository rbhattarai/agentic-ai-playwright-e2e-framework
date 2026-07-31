import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment-specific .env file
const env = process.env.ENV || 'dev';
const envFile = `.${env}.env`;
const envPath = path.resolve(process.cwd(), envFile);

if (fs.existsSync(envPath)) {
  console.log(`Loading environment from ${envFile}`);
  dotenv.config({ path: envPath });
} else {
  console.warn(`⚠️  Environment file ${envFile} not found, trying .env`);
  dotenv.config(); // fallback to .env
}

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 90000, // Increased to 90s for multi-app workflows
  retries: process.env.CI ? 1 : 0, // Retry once in CI for flaky tests
  expect: {
    timeout: 5000
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
    ['junit', { outputFile: 'reports/junit.xml' }],
    ['./utils/custom-reporter.ts'],
    ['./utils/step-report-reporter.ts']
  ],
  use: {
    headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
    baseURL: process.env.APP_URL, // Legacy single-app mode; multi-app uses apps.config.json
    ignoreHTTPSErrors: true,
    viewport: { width: 1280, height: 720 },
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { 
      name: 'chromium', 
      use: { ...devices['Desktop Chrome'] } 
    }
    // Uncomment to run on multiple browsers
    // { name: 'msedge', use: { ...devices['Desktop Edge']}},
    // { name: 'firefox', use: { ...devices['Desktop Firefox']}}
  ],
  workers: process.env.CI ? 2 : 1, // Parallel execution in CI
});
