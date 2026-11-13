// spec: specs/loan-rejection-workflow-plan.md
// seed: tests/seed.spec.ts
import { expect } from '@playwright/test';
import { test } from '@fixtures/base';
import { stepWithScreenshot } from '@helpers/reporting';
import { LendingAppPage } from '../lending-app/pages/LendingAppPage';
import { LoanAppPage } from '../loan-app/pages/LoanAppPage';

test.describe('SCRUM-4 Loan rejection flow @SCRUM-4 @MultiApp', () => {
  let createdLoanId = '';
  let createdLenderName = '';

  test.afterEach(async ({ apps }) => {
    if (!apps['loan-app'] || !apps['lending-app']) return;

    const loanApp = apps['loan-app'];
    const lendingApp = apps['lending-app'];
    const loanAppPage = new LoanAppPage(loanApp.page, loanApp.baseUrl);
    const lendingAppPage = new LendingAppPage(lendingApp.page, lendingApp.baseUrl);

    if (createdLoanId) {
      await stepWithScreenshot(test, `[Cleanup] Delete loan ${createdLoanId}`, loanApp.page, async () => {
        await loanAppPage.deleteLoan(createdLoanId);
        createdLoanId = '';
      });
    }
    if (createdLenderName) {
      await stepWithScreenshot(test, `[Cleanup] Delete lender "${createdLenderName}"`, lendingApp.page, async () => {
        await lendingAppPage.deleteApprover(createdLenderName);
        createdLenderName = '';
      });
    }
  });

  test('Create, assign, reject, verify, and clean up a loan and lender', async ({ apps }) => {
    if (!apps['loan-app'] || !apps['lending-app']) {
      test.skip(true, 'Both loan-app and lending-app must be configured');
      return;
    }

    const loanApp = apps['loan-app'];
    const lendingApp = apps['lending-app'];
    const loanAppPage = new LoanAppPage(loanApp.page, loanApp.baseUrl);
    const lendingAppPage = new LendingAppPage(lendingApp.page, lendingApp.baseUrl);
    const uniqueSuffix = Date.now();
    const applicantName = `SCRUM4 Applicant ${uniqueSuffix}`;
    const lenderName = `SCRUM4 Approver ${uniqueSuffix}`;
    const loanAmount = '2500';
    let loanId = '';

    await stepWithScreenshot(test, '1. Starting from a blank/fresh shared state, open Loan App > Loans > New Loan. Enter a unique applicant name and a valid loan amount, then submit.', loanApp.page, async () => {
      await loanAppPage.goto();
      await loanAppPage.gotoLoansPage();
      await loanAppPage.openNewLoanModal();
      await loanAppPage.fillAndSubmitLoan(applicantName, loanAmount);
      loanId = await loanAppPage.getLoanIdByApplicant(applicantName);
      createdLoanId = loanId;
      expect(loanId).toMatch(/^LOAN-/);
      await loanAppPage.verifyLoanInLoansGrid(loanId, 'New');
    });

    await stepWithScreenshot(test, '2. In Loan App, locate the newly created loan by its recorded ID and inspect its status.', loanApp.page, async () => {
      await loanAppPage.verifyLoanInLoansGrid(loanId, 'New');
    });

    await stepWithScreenshot(test, '3. In Lending App, open Lendors and add a new loan approver (lender) using a unique name.', lendingApp.page, async () => {
      await lendingAppPage.goto();
      await lendingAppPage.gotoLendorsPage();
      await lendingAppPage.openAddApproverModal();
      await lendingAppPage.fillAndSubmitApprover(lenderName);
      createdLenderName = lenderName;
      await expect(lendingApp.page.getByRole('row').filter({ hasText: lenderName })).toBeVisible();
    });

    await stepWithScreenshot(test, '4. In Lending App, open the newly created loan by its recorded ID and assign the newly created lender by its exact name.', lendingApp.page, async () => {
      await lendingAppPage.gotoDashboard();
      await lendingAppPage.clickViewForLoan(loanId);
      await expect(lendingApp.page.getByRole('heading', { name: loanId })).toBeVisible();
      await lendingAppPage.selectAndAssignApprover(lenderName);
      await lendingAppPage.gotoDashboard();
      await expect(lendingApp.page.locator(`//tr//td[contains(text(),'${applicantName}')]/..//td[4]//span`)).toHaveText('Pending');
    });

    await stepWithScreenshot(test, '5. Return to Loan App and locate the target loan by ID.', loanApp.page, async () => {
      await loanAppPage.goto('/loan');
      await loanAppPage.verifyLoanInLoansGrid(loanId, 'Pending', lenderName);
    });

    await stepWithScreenshot(test, '6. In Lending App, open the target loan and use the lender\'s rejection action.', lendingApp.page, async () => {
      await lendingApp.page.goto(`${lendingApp.baseUrl}/loan/${encodeURIComponent(loanId)}`);
      await expect(lendingApp.page.getByRole('heading', { name: loanId })).toBeVisible();
      await lendingAppPage.rejectLoan();
    });

    await stepWithScreenshot(test, '7. In Lending App, inspect the target loan\'s resulting status.', lendingApp.page, async () => {
      await lendingAppPage.verifyLoanStatus('Rejected');
    });

    await stepWithScreenshot(test, '8. In Loan App, locate the same target loan by ID and inspect its status.', loanApp.page, async () => {
      await loanAppPage.goto('/loan');
      await loanAppPage.verifyLoanInLoansGrid(loanId, 'Rejected', lenderName);
    });

    await stepWithScreenshot(test, '9. In Loan App, delete only the recently rejected target loan.', loanApp.page, async () => {
      await loanAppPage.deleteLoan(loanId);
      createdLoanId = '';
      await expect(loanApp.page.getByText(loanId)).toHaveCount(0);
    });

    await stepWithScreenshot(test, '10. In Lending App, delete only the lender created for this workflow.', lendingApp.page, async () => {
      await lendingAppPage.deleteApprover(lenderName);
      createdLenderName = '';
      await expect(lendingApp.page.getByText(lenderName)).toHaveCount(0);
    });
  });
});