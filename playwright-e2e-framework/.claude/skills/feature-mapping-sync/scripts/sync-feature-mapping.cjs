#!/usr/bin/env node
/**
 * Syncs feature_mapping.csv from the Jira tags on Playwright specs.
 *
 * CSV format (one row per user story):
 *   user_story_key,issue_summary,test_case_keys
 *   SCRUM-5,E2E Loan Approval Workflow,SCRUM-10;SCRUM-11
 *
 * Tag convention (see AGENTS.md → Tags Convention):
 *   - Jira key in a test.describe title → the user STORY the block covers  (user_story_key)
 *   - Jira key tagged on an individual test (title or { tag }) → its Xray TEST CASE (test_case_keys)
 *
 * Reads tests via `npx playwright test --list --reporter=json` (no browser, no app needed),
 * then appends rows for new story keys, merges new test-case keys into existing rows (never
 * removes any), and reports not-yet-automated stories and unattributed test-case keys.
 * Migrates the old `user_story,feature,jira_key[,test_case_keys]` format automatically.
 *
 * Usage: node .claude/skills/feature-mapping-sync/scripts/sync-feature-mapping.cjs [--dry-run]
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DRY = process.argv.includes('--dry-run');
const CSV = path.resolve('feature_mapping.csv');
const HEADER = ['user_story_key', 'issue_summary', 'test_case_keys'];
const KEY = /^[A-Z][A-Z0-9]+-\d+$/;
const keysIn = (text) => (String(text).match(/@([A-Z][A-Z0-9]+-\d+)\b/g) || []).map((t) => t.slice(1));
const clean = (s) => String(s || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim(); // no commas in cells

// Real Jira summary, if jira-story-reader has written requirements/context-<KEY>.md ("# KEY: Summary").
const jiraSummary = (key) => {
  const f = path.resolve('requirements', `context-${key}.md`);
  if (!fs.existsSync(f)) return '';
  const m = fs.readFileSync(f, 'utf8').match(new RegExp(`^#\\s*${key}\\s*:\\s*(.+)$`, 'm'));
  return m ? clean(m[1]) : '';
};

// 1. Collect story → { summary, testKeys } from the test list.
let raw;
try {
  raw = execSync('npx playwright test --list --reporter=json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  raw = e.stdout || '';
}
const start = raw.indexOf('{');
if (start < 0) {
  console.error('Could not list tests (npx playwright test --list --reporter=json produced no JSON).');
  process.exit(2);
}
const list = JSON.parse(raw.slice(start));

const stories = new Map(); // storyKey -> { summary, testKeys:Set }
const unattributed = new Set();
const walk = (suite, storyKeys, title) => {
  const own = keysIn(suite.title);
  const sk = own.length ? own : storyKeys;
  const t = own.length ? suite.title.replace(/@\S+/g, '') : title;
  for (const k of own) if (!stories.has(k)) stories.set(k, { summary: clean(t), testKeys: new Set() });
  for (const spec of suite.specs || []) {
    const testKeys = (spec.tags || []).filter((x) => KEY.test(x) && !sk.includes(x));
    for (const tk of testKeys) {
      if (!sk.length) unattributed.add(`${tk} (${spec.file}: "${spec.title}")`);
      for (const s of sk) stories.get(s).testKeys.add(tk);
    }
  }
  for (const child of suite.suites || []) walk(child, sk, t);
};
for (const s of list.suites || []) walk(s, [], '');

// 2. Load the CSV (current or legacy format) into { user_story_key, issue_summary, test_case_keys } rows.
const lines = fs.existsSync(CSV) ? fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter((l) => l.trim()) : [HEADER.join(',')];
const header = lines[0].split(',').map((h) => h.trim());
const migrated = header.join(',') !== HEADER.join(',');
const rows = lines.slice(1).map((l) => {
  const p = l.split(',');
  const o = {};
  header.forEach((h, i) => (o[h] = (p[i] || '').trim()));
  return {
    user_story_key: (o.user_story_key || o.jira_key || '').toUpperCase(),
    issue_summary: o.issue_summary || o.feature || '',
    test_case_keys: o.test_case_keys || '',
  };
});

// 3. Merge.
const added = [], updated = [];
for (const [story, info] of stories) {
  let row = rows.find((r) => r.user_story_key === story);
  if (!row) {
    row = { user_story_key: story, issue_summary: jiraSummary(story) || info.summary, test_case_keys: '' };
    rows.push(row);
    added.push(`${story} (${row.issue_summary})`);
  }
  const existing = row.test_case_keys.split(';').map((s) => s.trim()).filter(Boolean);
  const merged = [...new Set([...existing, ...info.testKeys])];
  const fresh = merged.filter((k) => !existing.includes(k));
  if (fresh.length) updated.push(`${story}: +${fresh.join(';')}`);
  row.test_case_keys = merged.join(';');
}
const notAutomated = rows.filter((r) => r.user_story_key && !stories.has(r.user_story_key)).map((r) => r.user_story_key);

// 4. Write + report.
const changed = migrated || added.length || updated.length;
if (changed && !DRY) {
  fs.writeFileSync(CSV, [HEADER.join(','), ...rows.map((r) => HEADER.map((h) => r[h]).join(','))].join('\n') + '\n');
}
console.log(`${DRY ? '[dry-run] ' : ''}feature_mapping.csv ${changed ? (DRY ? 'would change' : 'updated') : 'already in sync'}`);
if (migrated) console.log(`  migrated header: ${header.join(',')} → ${HEADER.join(',')}`);
for (const a of added) console.log(`  added row: ${a}`);
for (const u of updated) console.log(`  test cases: ${u}`);
if (notAutomated.length) console.log(`  not automated yet (in CSV, no spec tags it — shown as uncovered in the report; kept): ${notAutomated.join(', ')}`);
if (unattributed.size) console.log(`  unattributed test-case keys (no story key on an enclosing describe):\n    ${[...unattributed].join('\n    ')}`);
