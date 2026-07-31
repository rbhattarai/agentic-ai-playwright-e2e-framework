---
name: feature-mapping-sync
description: Scans tests/ for Jira-tagged specs (@SCRUM-XXX) missing from feature_mapping.csv, which drives the custom coverage report (utils/custom-reporter.ts). Adds missing rows directly and reports what changed. Use when asked to sync/update feature mapping, check coverage report accuracy, or after generating new spec files (e.g. by the NEW TESTS pipeline).
---

`feature_mapping.csv` (repo root, columns `user_story,feature,jira_key`) maps Jira story
keys to feature names for `utils/custom-reporter.ts`'s coverage report
(`reports/coverage-report.html`). It's hand-maintained and has no automatic check against
actual spec files — it will silently go stale as new specs get tagged with story keys
that were never added here (especially now that `test-orchestrator`'s NEW TESTS pipeline
generates specs from Jira stories directly).

## 1. Find every Jira key actually referenced in tests

```bash
grep -rhoE '@[A-Z]+-[0-9]+' tests/apps --include="*.spec.ts" | sort -u
```

(Same key pattern `utils/xray-upload.ts` already scans for:
`\b[A-Z]+-\d+\b`, restricted here to `@`-prefixed tags specifically since that's the
Tags Convention.)

## 2. Diff against the CSV

Read `feature_mapping.csv`'s `jira_key` column. Any key from step 1 not present there is
a gap.

## 3. Fill in missing rows

For each missing key:
- `jira_key`: the key itself.
- `feature`: derive from the `test.describe` title in the spec file(s) that reference it
  (strip the `@Tag` suffixes, keep the human-readable part) — don't invent a name
  unrelated to what the test actually describes.
- `user_story`: next sequential `US-N` (one past the highest existing `US-` number in the
  file) unless the spec/context file gives a real story identifier to use instead (e.g.
  a `requirements/context-<KEY>.md` exists for that key — prefer its actual title).

Add the rows directly (this is a plain tracked CSV, low-risk, git-reversible — no need to
stage this behind an approval step the way Jira-mutating agents are). Preserve existing
row order; append new rows at the end.

## 4. Report

List exactly which rows were added (key, feature, user_story) and — separately — any
keys already in the CSV that no longer appear in any spec file (stale entries; report
these, don't auto-delete them, since a key might be temporarily commented out or the
removal might be worth a second look before dropping recorded coverage history).
