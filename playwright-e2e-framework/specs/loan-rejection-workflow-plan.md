# SCRUM-4 — E2E Loan Rejection Workflow

## Application Overview

Plan for the described cross-application loan rejection flow in Loan App and Lending App. It is derived only from the SCRUM-4 description and observed application workflows. The Jira story has no separate Acceptance Criteria; the ten description steps are the sole requirements. Assume a blank/fresh shared data state for each run, both apps available, and use unique applicant and lender names so the newly created records can be identified unambiguously.

## Test Scenarios

### 1. SCRUM-4 Loan rejection flow

**Seed:** `tests/seed.spec.ts`

#### 1.1. Create, assign, reject, verify, and clean up a loan and lender

**File:** `tests/apps/e2e/e2e-loan-rejection-workflow.spec.ts`

**Steps:**
  1. Starting from a blank/fresh shared state, open Loan App > Loans > New Loan. Enter a unique applicant name and a valid loan amount, then submit.
    - expect: The loan is created and appears in Loan App's loan list.
    - expect: Record the generated loan ID so the same loan can be identified in both applications and during cleanup.
  2. In Loan App, locate the newly created loan by its recorded ID and inspect its status.
    - expect: The newly created loan's status is New.
  3. In Lending App, open Lendors and add a new loan approver (lender) using a unique name.
    - expect: The newly created lender appears in the lender/approver list. Record its exact name for assignment and cleanup.
  4. In Lending App, open the newly created loan by its recorded ID and assign the newly created lender by its exact name.
    - expect: The selected loan is the target loan, and the assigned lender is the newly created lender.
    - expect: The assignment completes without changing a different loan.
  5. Return to Loan App and locate the target loan by ID.
    - expect: The target loan's status has changed to Pending.
  6. In Lending App, open the target loan and use the lender's rejection action.
    - expect: The rejection action applies to the target loan assigned to the newly created lender.
  7. In Lending App, inspect the target loan's resulting status.
    - expect: The target loan's status is Rejected.
  8. In Loan App, locate the same target loan by ID and inspect its status.
    - expect: The target loan's status is Rejected in Loan App as well.
  9. In Loan App, delete only the recently rejected target loan.
    - expect: The target loan is removed from Loan App's loan list.
    - expect: No other loan is selected for deletion.
  10. In Lending App, delete only the lender created for this workflow.
    - expect: The target lender is removed from Lending App's lender/approver list.
    - expect: No other lender is selected for deletion.
