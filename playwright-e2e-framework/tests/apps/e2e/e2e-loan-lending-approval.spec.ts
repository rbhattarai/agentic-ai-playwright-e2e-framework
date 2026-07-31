import { test, expect } from '../../fixtures/base';
import { LoanAppPage } from '../loan-app/pages/LoanAppPage';
import { LendingAppPage } from '../lending-app/pages/LendingAppPage';
import { stepWithScreenshot } from '@helpers/reporting';

/**
 * E2E workflow: loan creation in loan-app → approver assignment and approval in lending-app
 *
 * Prerequisites:
 *   - loan-webapp running on https://localhost:3000
 *   - lending-webapp running on https://localhost:3001
 *
 * Run:
 *   ./run_test.sh -apps=loan-app,lending-app -env=dev -tags=@LoanApproval
 */

test.describe('E2E Loan Approval Workflow @LoanApproval @SmokeTest @MultiApp @SCRUM-5', () => {
  let createdLoanId = '';
  let createdApproverName = '';

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
    if (createdApproverName) {
      await stepWithScreenshot(test, `[Cleanup] Delete approver "${createdApproverName}"`, lendingApp.page, async () => {
        await lendingAppPage.deleteApprover(createdApproverName);
        createdApproverName = '';
      });
    }
  });

  test('Full loan creation, approver assignment, and approval flow', async ({ apps }) => {
    if (!apps['loan-app'] || !apps['lending-app']) {
      test.skip(true, 'Both loan-app and lending-app must be configured');
      return;
    }

    const loanApp = apps['loan-app'];
    const lendingApp = apps['lending-app'];
    const loanAppPage = new LoanAppPage(loanApp.page, loanApp.baseUrl);
    const lendingAppPage = new LendingAppPage(lendingApp.page, lendingApp.baseUrl);

    const uniqueSuffix = Date.now();
    const applicantName = `Test Applicant ${uniqueSuffix}`;
    const loanAmount = '25000';
    const approverName = `Test Approver ${uniqueSuffix}`;
    let loanId = '';

    // ─── LOAN-WEBAPP ──────────────────────────────────────────────────────────

    await stepWithScreenshot(test, 'Open loan webapp and navigate to Loans page', loanApp.page, async () => {
      await loanAppPage.goto();
      await loanAppPage.gotoLoansPage();
    });

    await stepWithScreenshot(test, 'Open New Loan modal', loanApp.page, async () => {
      await loanAppPage.openNewLoanModal();
    });

    await stepWithScreenshot(test, `Fill and submit new loan for "${applicantName}"`, loanApp.page, async () => {
      await loanAppPage.fillAndSubmitLoan(applicantName, loanAmount);
    });

    await stepWithScreenshot(test, 'Verify new loan appears in Loans grid with New status and no approver', loanApp.page, async () => {
      loanId = await loanAppPage.getLoanIdByApplicant(applicantName);
      createdLoanId = loanId;
      expect(loanId).toBeTruthy();
      await loanAppPage.verifyLoanInLoansGrid(loanId, 'New', '');
    });

    await stepWithScreenshot(test, 'Navigate to Dashboard and verify loan entry', loanApp.page, async () => {
      await loanAppPage.gotoDashboard();
      await loanAppPage.verifyLoanInDashboard(loanId, 'New', '');
    });

    // ─── LENDING-WEBAPP ───────────────────────────────────────────────────────

    await stepWithScreenshot(test, 'Open lending webapp', lendingApp.page, async () => {
      await lendingAppPage.goto();
    });

    await stepWithScreenshot(test, 'Navigate to Lendors page and open Add New Loan Approver modal', lendingApp.page, async () => {
      await lendingAppPage.gotoLendorsPage();
      await lendingAppPage.openAddApproverModal();
    });

    await stepWithScreenshot(test, `Add new approver "${approverName}"`, lendingApp.page, async () => {
      await lendingAppPage.fillAndSubmitApprover(approverName);
      createdApproverName = approverName;
    });

    await stepWithScreenshot(test, 'Navigate to Dashboard and verify loan entry with New status', lendingApp.page, async () => {
      await lendingAppPage.gotoDashboard();
      await lendingAppPage.verifyLoanInDashboard(loanId, 'New');
    });

    await stepWithScreenshot(test, `Open loan detail for "${loanId}"`, lendingApp.page, async () => {
      await lendingAppPage.clickViewForLoan(loanId);
    });

    await stepWithScreenshot(test, `Assign approver "${approverName}" to the loan`, lendingApp.page, async () => {
      await lendingAppPage.selectAndAssignApprover(approverName);
    });

    await stepWithScreenshot(test, 'Verify loan status is Pending and Approve/Reject buttons are visible', lendingApp.page, async () => {
      await lendingAppPage.verifyLoanStatus('Pending');
      await lendingAppPage.verifyApproveRejectButtonsVisible();
    });

    // ─── BACK TO LOAN-WEBAPP ─────────────────────────────────────────────────

    await stepWithScreenshot(test, 'Navigate back to loan webapp Loans page and verify Pending status with approver assigned', loanApp.page, async () => {
      await loanApp.page.goto(`${loanApp.baseUrl}/loan`);
      await loanApp.page.waitForLoadState('domcontentloaded');
      await loanAppPage.verifyLoanInLoansGrid(loanId, 'Pending', approverName);
    });

    // ─── APPROVE IN LENDING-WEBAPP ────────────────────────────────────────────

    await stepWithScreenshot(test, 'Navigate back to lending webapp loan detail and click Approve', lendingApp.page, async () => {
      await lendingAppPage.approveLoan();
    });

    await stepWithScreenshot(test, 'Verify loan status is Approved in lending webapp', lendingApp.page, async () => {
      await lendingAppPage.verifyLoanStatus('Approved');
    });

    // ─── FINAL VERIFICATION IN LOAN-WEBAPP ───────────────────────────────────

    await stepWithScreenshot(test, 'Navigate to loan webapp Dashboard and verify status is Approved', loanApp.page, async () => {
      await loanApp.page.goto(`${loanApp.baseUrl}/index`);
      await loanApp.page.waitForLoadState('domcontentloaded');
      await loanAppPage.verifyLoanInDashboard(loanId, 'Approved', approverName);
    });
  });
});
