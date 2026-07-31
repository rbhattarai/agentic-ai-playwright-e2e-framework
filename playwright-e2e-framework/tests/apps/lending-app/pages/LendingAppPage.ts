import { Page, expect } from '@playwright/test';
import { BasePage } from '../../../pages/BasePage';

export class LendingAppPage extends BasePage {
  // Navigation
  private readonly navDashboard = 'a.nav-link[href="/index"]';
  private readonly navLendors = 'a.nav-link[href="/lendor"]';

  // Lendors page
  private readonly addApproverBtn = 'button[data-bs-target="#newApproverModal"]';
  private readonly approverNameInput = '#approverName';
  private readonly submitApproverBtn = '#newApproverModal .modal-footer button[type="submit"]';

  // Dashboard
  private readonly recentLoansGrid = '#recentLoansGrid';

  // Loan detail page
  private readonly loanStatusBadge = '#loanStatus';
  private readonly approverDropdown = '#approver';
  private readonly assignApproverBtn = '#assignApproverBtn';
  private readonly approveLoanBtn = '#approveLoanBtn';
  private readonly rejectLoanBtn = '#rejectLoanBtn';

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
  }

  async gotoLendorsPage() {
    await this.page.click(this.navLendors);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async gotoDashboard() {
    await this.page.click(this.navDashboard);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async openAddApproverModal() {
    await this.page.click(this.addApproverBtn);
    await this.page.waitForSelector('#newApproverModal.show');
  }

  async fillAndSubmitApprover(approverName: string) {
    await this.page.fill(this.approverNameInput, approverName);
    await this.page.click(this.submitApproverBtn);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoanInDashboard(loanId: string, status: string, approver = '') {
    const row = this.getLoanRow(loanId);
    await expect(row).toBeVisible();
    await expect(row.locator('span.badge', { hasText: status })).toBeVisible();
    if (approver) {
      await expect(row.locator('td').nth(4)).toHaveText(approver);
    }
  }

  async clickViewForLoan(loanId: string) {
    const row = this.getLoanRow(loanId);
    await row.locator('a.btn-outline-success').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  async selectAndAssignApprover(approverName: string) {
    await this.page.selectOption(this.approverDropdown, { label: approverName });
    await this.page.click(this.assignApproverBtn);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoanStatus(status: string) {
    await expect(this.page.locator(this.loanStatusBadge)).toHaveText(status);
  }

  async verifyApproveRejectButtonsVisible() {
    await expect(this.page.locator(this.approveLoanBtn)).toBeVisible();
    await expect(this.page.locator(this.rejectLoanBtn)).toBeVisible();
  }

  async approveLoan() {
    await this.page.click(this.approveLoanBtn);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async rejectLoan() {
    await this.page.click(this.rejectLoanBtn);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async deleteApprover(approverName: string) {
    await this.page.goto(`${this.baseUrl}/lendor`);
    await this.page.waitForLoadState('domcontentloaded');
    const row = this.page.locator('#approversGrid tbody tr', {
      has: this.page.locator('td', { hasText: approverName })
    });
    this.page.once('dialog', dialog => dialog.accept());
    await row.locator('form[action$="/delete"] button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  private getLoanRow(loanId: string) {
    return this.page.locator(`${this.recentLoansGrid} tbody tr`, {
      has: this.page.locator('td:first-child span.badge', { hasText: loanId })
    });
  }
}
