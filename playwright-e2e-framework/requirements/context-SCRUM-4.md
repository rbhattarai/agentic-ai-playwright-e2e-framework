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
| Created / Updated | 2026-11-11 17:48:10 EST / 2026-11-13 12:54:30 EST |

## Description
Steps:

1. In Loan App, navigate to loans, and Create New Loan
2. In Loan App, verify loan status is New in the grid
3. In Lending App, navigate to Lendors and Add New Lender
4. In Lending App, navigate to dashboard and select recently created loan and assign recent Lender
5. In Lending app, navigate to dashboard again, and verify loan status changed to Pending
6. In Loan App, navigate to dashboard and verify loan status changes to Pending
7. In Lending App, open that loan and Reject the Loan by the recently added Lender
8. In Lending App, navigate to dashboard and Verify Loan status changes to Rejected
9. In Loan App, navigate to dashboard and verify Loan status is Rejected
10. In Loan App, navigate to loans and delete recently rejected loan
11. In Lending app, navigate to lendors and delete recently created Lender

## Acceptance Criteria
None found. This Jira issue does not expose a custom field named "Acceptance Criteria", and the description contains no "Acceptance Criteria" heading or section.

## Attachments
None

## Linked Issues & Subtasks
None

## Comments
None
