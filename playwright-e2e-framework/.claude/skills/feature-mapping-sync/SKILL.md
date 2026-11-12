---
name: feature-mapping-sync
description: Syncs feature_mapping.csv (user_story_key,issue_summary,test_case_keys — drives the coverage report in utils/custom-reporter.ts and the email report) from the Jira tags on Playwright specs — story keys on test.describe blocks become rows, Xray test-case keys tagged on individual tests go into the row's test_case_keys column. Adds missing rows/keys directly and reports not-yet-automated stories or unattributed keys. Use when asked to sync/update feature mapping or check coverage report accuracy; called by test-orchestrator after generating specs and by test-case-creator after tagging specs with new test-case keys.
---

<!-- Single source of truth for this skill. GitHub Copilot loads it through
     .github/skills/feature-mapping-sync/SKILL.md — keep instructions here harness-neutral. -->

`feature_mapping.csv` (repo root) maps each Jira user story to its Xray test cases for
the coverage report (`utils/custom-reporter.ts` → `reports/coverage-report.html`) and
the emailed summary (`utils/send-report-email.js`). It is **derived from spec tags** —
the specs are the source of truth, so don't hand-edit keys into the CSV that no spec
carries.

## Format

One row per user story:

```csv
user_story_key,issue_summary,test_case_keys
SCRUM-5,E2E Loan Approval Workflow,SCRUM-10;SCRUM-11
```

| Column | Meaning |
|---|---|
| `user_story_key` | The Jira **user story** key — taken from a `@KEY` tag in a `test.describe` title |
| `issue_summary` | The story's Jira summary — from `requirements/context-<KEY>.md` (written by `jira-story-reader`) when it exists, otherwise the `test.describe` title with tags stripped |
| `test_case_keys` | The Xray **test case** keys automating that story, `;`-separated — taken from `@KEY` tags on individual tests inside that describe |

Keys are `;`-separated and summaries never contain commas because the reporters' CSV
parser splits on commas.

## Tag convention this relies on

```ts
test.describe('Loan Rejection Workflow @MultiApp @SCRUM-4', () => {        // story
  test('reject a loan', { tag: ['@SCRUM-10'] }, async ({ apps }) => { ... }); // Xray test case
});
```

## 1. Sync

```bash
node .claude/skills/feature-mapping-sync/scripts/sync-feature-mapping.cjs --dry-run   # preview
node .claude/skills/feature-mapping-sync/scripts/sync-feature-mapping.cjs             # apply
```

The script lists tests with `npx playwright test --list --reporter=json` (no browser or
running app needed), then:

- appends a row for each story key not yet in the CSV (summary as described above);
- merges newly tagged test-case keys into the story's row (never removes keys);
- preserves existing row order and existing summaries;
- migrates the legacy `user_story,feature,jira_key[,test_case_keys]` header
  automatically.

Applying directly is fine — it's a plain tracked CSV, low-risk, git-reversible; no
approval step needed.

## 2. Report

Relay the script's output: rows added, test-case keys added per story, story keys
**not automated yet** (in the CSV but no spec tags them — expected for stories without
tests, they show as uncovered in the report; never delete them), and
**unattributed** test-case keys (tagged on a test with no story key on an enclosing
describe — the spec needs a story tag on its `test.describe`).
