# E2E Loan Rejection Workflow — SCRUM-4

## Application Overview

End-to-end workflow across Loan App and Lending App: create a loan, add and assign a lender/loan approver, observe Pending and Rejected statuses in both applications, then delete the rejected loan and lender. Jira has no separate acceptance criteria, so coverage is limited to the ten described actions and their stated status checks. Exploration found Loan App on localhost:3000 and Lending App on localhost:3001; the lending UI labels lenders as loan approvers/Lendors. Assume a fresh isolated test state and use unique applicant and lender names. No applicant, amount, lender attributes, rejection reason, or validation rules are specified; use values accepted by the current UI without asserting unspecified business rules. The exact dashboard assignment and rejection controls should be confirmed during implementation. Do not delete pre-existing records.

## Test Scenarios

### 1. SCRUM-4 — E2E Loan Rejection Workflow

**Seed:** `tests/seed.spec.ts`

#### 1.1. Create, assign, reject, verify, and clean up a loan and lender

**File:** `tests/scrum-4/e2e-loan-rejection-workflow.spec.ts`

**Steps:**
  1. Precondition: Start from a fresh/isolated test state using the seed setup. Generate a unique applicant name and a unique lender name so the new records can be identified without touching existing data. The loan form requires an applicant name and loan amount; enter values accepted by the UI because Jira does not specify their business constraints.
    - expect: The flow targets only the newly created loan and lender; pre-existing records are not modified or deleted.
  2. In Loan App, open Loans, select New Loan, enter the unique applicant name and a valid loan amount, and submit the application.
    - expect: A new loan is created and appears in the Loan App loans grid with its identifying details.
  3. Locate that newly created loan in the Loan App grid and inspect its status.
    - expect: The new loan's status is New.
  4. In Lending App, open Lendors (Loan Approvers) and add a new lender using the unique lender name; submit the form.
    - expect: The newly added lender/loan approver is present in the lender management list.
  5. In the Lending App Dashboard, locate the loan created in the first step and assign the newly added lender using the dashboard's available assignment control.
    - expect: The selected lender is associated with the newly created loan.
    - expect: The loan status is Pending in the Lending App.
  6. Return to the Loan App and locate the same loan by its identifying details.
    - expect: The loan status is Pending in the Loan App.
  7. In the Lending App Dashboard, open the newly created loan's detail view and choose the action to reject it. Complete any required UI confirmation without adding an unspecified rejection reason.
    - expect: The loan detail reflects the rejection action.
  8. Verify the same loan in the Lending App after rejection.
    - expect: The loan status is Rejected in the Lending App.
  9. Return to the Loan App loans grid and locate the same loan.
    - expect: The loan status is Rejected in the Loan App.
  10. Delete only the rejected loan created by this scenario from the Loan App grid; handle any confirmation dialog if shown.
    - expect: The targeted rejected loan is removed from the Loan App grid.
  11. In Lending App, open lender management and delete only the lender created by this scenario; handle any confirmation dialog if shown.
    - expect: The targeted lender is removed from lender management.
  12. Scope and gaps: Jira supplied no separate acceptance criteria. Do not add assertions for loan/lender field constraints, rejection reason, assignment eligibility rules, confirmation behavior, or error/edge cases; those requirements are unspecified. During implementation, confirm the concrete dashboard assignment and reject controls. Cleanup order follows the story: delete the rejected loan before deleting its lender.
    - expect: The scenario passes only when every stated status checkpoint and both cleanup outcomes above are met.
