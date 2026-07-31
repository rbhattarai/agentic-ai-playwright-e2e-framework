import { Page, expect } from '@playwright/test';
import { BasePage } from '../../../pages/BasePage';

export class LoanAppPage extends BasePage {
  // Navigation
  private readonly navDashboard = 'a.nav-link[href="/index"]';
  private readonly navLoans = 'a.nav-link[href="/loan"]';

  // Loans management page
  private readonly newLoanBtn = 'button[data-bs-target="#newLoanModal"]';
  private readonly applicantNameInput = '#applicantName';
  private readonly amountInput = '#amount';
  private readonly submitLoanBtn = '#newLoanModal .modal-footer button[type="submit"]';
  private readonly loansGrid = '#loansGrid';

  // Dashboard page
  private readonly recentLoansGrid = '#recentLoansGrid';

  constructor(page: Page, baseUrl: string) {
    super(page, baseUrl);
  }

  async gotoLoansPage() {
    await this.page.click(this.navLoans);
    await this.page.waitForLoadState('load');
  }

  async gotoDashboard() {
    await this.page.click(this.navDashboard);
    await this.page.waitForLoadState('load');
  }

  async openNewLoanModal() {
    await this.page.click(this.newLoanBtn);
    await this.page.waitForSelector('#newLoanModal.show');
  }

  async fillAndSubmitLoan(applicantName: string, amount: string) {
    await this.page.fill(this.applicantNameInput, applicantName);
    await this.page.fill(this.amountInput, amount);
    await this.page.click(this.submitLoanBtn);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getLoanIdByApplicant(applicantName: string): Promise<string> {
    const row = this.page.locator(`${this.loansGrid} tbody tr`, {
      has: this.page.locator('td:nth-child(2)', { hasText: applicantName })
    });
    const badge = row.locator('td:first-child span.badge');
    return (await badge.textContent())?.trim() ?? '';
  }

  async verifyLoanInLoansGrid(loanId: string, status: string, approver = '') {
    const row = this.getLoanRow(this.loansGrid, loanId);
    await expect(row).toBeVisible();
    await expect(row.locator('span.badge', { hasText: status })).toBeVisible();
    const approverCell = row.locator('td').nth(4);
    await expect(approverCell).toHaveText(approver || '—');
  }

  async verifyLoanInDashboard(loanId: string, status: string, approver = '') {
    const row = this.getLoanRow(this.recentLoansGrid, loanId);
    await expect(row).toBeVisible();
    await expect(row.locator('span.badge', { hasText: status })).toBeVisible();
    const approverCell = row.locator('td').nth(4);
    await expect(approverCell).toHaveText(approver || '—');
  }

  async deleteLoan(loanId: string) {
    await this.page.goto(`${this.baseUrl}/loan`);
    await this.page.waitForLoadState('domcontentloaded');
    const row = this.getLoanRow(this.loansGrid, loanId);
    this.page.once('dialog', dialog => dialog.accept());
    await row.locator('form[action$="/delete"] button[type="submit"]').click();
    await this.page.waitForLoadState('domcontentloaded');
  }

  private getLoanRow(gridSelector: string, loanId: string) {
    return this.page.locator(`${gridSelector} tbody tr`, {
      has: this.page.locator('td:first-child span.badge', { hasText: loanId })
    });
  }
}
