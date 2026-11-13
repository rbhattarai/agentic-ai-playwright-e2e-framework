# SCRUM-4: E2E Loan Rejection Workflow

**Jira link:** https://aosqa.atlassian.net/browse/SCRUM-4

## Metadata
| Field | Value |
|---|---|
| Status | In Progress |
| Issue Type | Story |
| Priority | Medium |
| Labels | None |
| Components | None |
| Sprint | None |
| Epic Link | None |
| Fix Version | None |
| Reporter | Rohan Bhattarai |
| Assignee | Rohan Bhattarai |
| Created / Updated | 2026-11-11 17:48:10 -0500 / 2026-11-11 22:59:03 -0500 |

## Description
Steps:

1. In Loan App, create a new loan.
2. In Loan App, verify the loan status is **New**.
3. In Lending App, add a new lender.
4. In Lending App, select the recently created loan and assign the recently created lender.
5. In Loan App, verify the loan status changes to **Pending**.
6. In Lending App, have the lender reject the loan.
7. In Lending App, verify the loan status changes to **Rejected**.
8. In Loan App, verify the loan status is **Rejected**.
9. In Loan App, delete the recently rejected loan.
10. In Lending App, delete the recently created lender.

## Acceptance Criteria
None found. No custom field named "Acceptance Criteria" was present in the issue evidence, and the description contains no Acceptance Criteria heading/section.

## Attachments
None

## Linked Issues & Subtasks
None

## Comments
None
