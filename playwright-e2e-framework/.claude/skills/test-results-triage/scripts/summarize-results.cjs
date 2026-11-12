#!/usr/bin/env node
/**
 * Summarizes a Playwright JSON report (default: reports/results.json) for triage.
 * Prints one block per non-passing (or flaky) test with a pre-classified failure
 * category, then overall stats. Read-only; harness-agnostic (plain Node, no deps).
 *
 * Usage: node .claude/skills/test-results-triage/scripts/summarize-results.cjs [path] [--json]
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const file = path.resolve(args.find((a) => !a.startsWith('--')) || 'reports/results.json');

if (!fs.existsSync(file)) {
  console.error(`No Playwright JSON report at ${file}. Run the tests first (the json reporter writes reports/results.json).`);
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const stripAnsi = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');

// Order matters: first match wins.
const RULES = [
  ['environment', /ECONNREFUSED|ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|net::ERR_|ENOTFOUND|socket hang up|ERR_CERT|certificate|SSL|TLS|mac verify|pkcs12|Executable doesn't exist|npx playwright install|Environment file|Missing .*env|is not configured|baseURL.*undefined|Invalid URL/i],
  ['test-data', /strict mode violation|resolved to \d+ elements|already exists|duplicate/i],
  ['locator-or-ui-change', /waiting for (getBy|locator)|locator\.(click|fill|check|selectOption|hover|press|type|waitFor)|element\(s\) not found|Timeout \d+ms exceeded|toBeVisible|toBeAttached|not visible|detached from the DOM|Target (page|closed)/i],
  ['assertion-or-app-behavior', /expect\(.*\)\.(toBe|toEqual|toContain|toHaveText|toHaveValue|toHaveCount|toHaveURL|toMatch)|Expected:|Received:/i],
];
const classify = (msg) => (RULES.find(([, re]) => re.test(msg)) || ['unknown'])[0];

const out = [];
const walk = (suite, trail) => {
  const t = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const results = test.results || [];
      const last = results[results.length - 1] || {};
      const status = test.status || (spec.ok ? 'expected' : 'unexpected'); // expected|unexpected|flaky|skipped
      if (status === 'expected' || status === 'skipped') continue;
      const errResult = results.find((r) => (r.errors || []).length || r.error) || last;
      const errors = (errResult.errors && errResult.errors.length ? errResult.errors : [errResult.error]).filter(Boolean);
      const message = stripAnsi(errors.map((e) => e.message || e.value || '').join('\n'));
      const location = errors.map((e) => e.location).find(Boolean);
      const failedStep = (errResult.steps || []).find((s) => s.error);
      out.push({
        title: [...t.slice(1), spec.title].join(' › '),
        file: spec.file,
        line: spec.line,
        project: test.projectName,
        tags: spec.tags || [],
        status, // unexpected = failed; flaky = failed then passed on retry
        attempts: results.length,
        category: status === 'flaky' ? 'flaky' : classify(message),
        failedStep: failedStep ? failedStep.title : undefined,
        error: message.split('\n').filter((l) => l.trim()).slice(0, 8).join('\n'),
        errorLocation: location ? `${location.file}:${location.line}` : undefined,
        attachments: (errResult.attachments || []).filter((a) => a.path).map((a) => `${a.name}: ${a.path}`),
      });
    }
  }
  for (const child of suite.suites || []) walk(child, t);
};
for (const s of report.suites || []) walk(s, []);

const stats = report.stats || {};
const globalErrors = (report.errors || []).map((e) => stripAnsi(e.message || '').split('\n')[0]);

if (asJson) {
  console.log(JSON.stringify({ stats, globalErrors, tests: out }, null, 2));
  process.exit(0);
}

console.log(`Report: ${path.relative(process.cwd(), file)}  (started ${stats.startTime || '?'}, ${Math.round((stats.duration || 0) / 1000)}s)`);
console.log(`passed=${stats.expected ?? '?'} failed=${stats.unexpected ?? '?'} flaky=${stats.flaky ?? '?'} skipped=${stats.skipped ?? '?'}`);
for (const g of globalErrors) console.log(`GLOBAL ERROR (run-level, likely environment/config): ${g}`);
if (!out.length) {
  console.log('No failing or flaky tests.');
  process.exit(0);
}
for (const r of out) {
  console.log('\n---');
  console.log(`[${r.category}] ${r.status.toUpperCase()}  ${r.title}`);
  console.log(`  file: ${r.file}:${r.line}  project: ${r.project}  attempts: ${r.attempts}  tags: ${r.tags.map((x) => '@' + x).join(' ')}`);
  if (r.failedStep) console.log(`  failed step: ${r.failedStep}`);
  if (r.errorLocation) console.log(`  at: ${r.errorLocation}`);
  if (r.error) console.log('  error:\n' + r.error.split('\n').map((l) => '    ' + l).join('\n'));
  for (const a of r.attachments) console.log(`  artifact: ${a}`);
}
