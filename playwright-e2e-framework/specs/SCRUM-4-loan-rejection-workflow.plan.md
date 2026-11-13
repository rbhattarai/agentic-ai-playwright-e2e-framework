# SCRUM-4 — E2E Loan Rejection Workflow

## Application Overview

Plan for the Jira SCRUM-4 workflow across Loan App and Lending App. It follows the story's ten description steps only; Jira has no separately labeled acceptance criteria. Starting-state assumption: use a blank/fresh test state for the entities under test and do not rely on preexisting loans or lenders. UI exploration confirmed Loan App loan creation fields (Applicant Name and Loan Amount), Lending App's Loan Approver creation form, cross-app loan listings and detail status display, and navigation between loan management and Lending App. Assignment/rejection of a newly created loan should follow the workflow available in Lending App; no additional behavior or validation rules are presumed.

## Test Scenarios

### 1. SCRUM-4 loan rejection workflow

**Seed:** `tests/seed.spec.ts`

#### 1.1. Create, assign, reject, verify, and clean up a loan and lender

**File:** `tests/SCRUM-4-loan-rejection-workflow.spec.ts`

**Steps:**
  1. In Loan App, open Loans, choose New Loan, enter an applicant name and loan amount accepted by the form, and submit. Keep track of this newly created loan so it can be identified in both apps and cleaned up later.
    - expect: The new loan is created and identifiable in Loan App.
  2. In Loan App, locate the newly created loan and inspect its status.
    - expect: The newly created loan is shown with status New.
  3. In Lending App, open lender management, choose Add New Loan Approver, enter a new lender name, and submit. Keep track of the newly created lender.
    - expect: The new lender is created and identifiable in Lending App.
  4. In Lending App, select the loan created in step 1 and assign the lender created in step 3 to that loan.
    - expect: The selected lender is assigned to the selected loan.
  5. Return to Loan App and locate the same loan.
    - expect: The loan status is Pending.
  6. In Lending App, open the same loan as the assigned lender and reject it using the available loan decision action.
    - expect: The loan is rejected by the assigned lender.
  7. In Lending App, inspect the same loan after the rejection.
    - expect: The loan status is Rejected.
  8. In Loan App, inspect the same loan after the rejection.
    - expect: The loan status is Rejected.
  9. In Loan App, delete the rejected loan created in step 1.
    - expect: The rejected loan is deleted and is no longer present in Loan App.
  10. In Lending App, delete the lender created in step 3.
    - expect: The lender is deleted and is no longer present in Lending App.
