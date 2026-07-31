#!/usr/bin/env node
/**
 * Launches the sooperset/mcp-atlassian MCP server (via uvx) using the same
 * env-file convention as playwright.config.ts (`.${ENV}.env`, default `.dev.env`).
 * Maps this repo's JIRA_BASE_URL / JIRA_USER_EMAIL / JIRA_API_TOKEN vars
 * onto the JIRA_URL / JIRA_USERNAME / JIRA_API_TOKEN names mcp-atlassian expects.
 * Note: JIRA_API_TOKEN is a plain personal API token (id.atlassian.com/manage-profile/security/api-tokens)
 * — JIRA_XRAY_API_TOKEN is Xray-scoped and does not authenticate against the standard Jira REST API.
 */
const path = require('path');
const dotenv = require('dotenv');
const { spawn } = require('child_process');

const env = process.env.ENV || 'dev';
const envPath = path.resolve(__dirname, '..', `.${env}.env`);
dotenv.config({ path: envPath });

const required = ['JIRA_BASE_URL', 'JIRA_USER_EMAIL', 'JIRA_API_TOKEN'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`[jira-mcp-server] Missing env vars in ${envPath}: ${missing.join(', ')}`);
  process.exit(1);
}

const child = spawn(
  'uvx',
  [
    'mcp-atlassian',
    '--jira-url', process.env.JIRA_BASE_URL,
    '--jira-username', process.env.JIRA_USER_EMAIL,
    '--jira-token', process.env.JIRA_API_TOKEN,
    '--read-only',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      // uv's hardlink cache breaks on OneDrive-synced paths (os error 396); fall back to copy.
      UV_LINK_MODE: process.env.UV_LINK_MODE || 'copy',
    },
  },
);

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error('[jira-mcp-server] Failed to start uvx mcp-atlassian:', err.message);
  process.exit(1);
});
