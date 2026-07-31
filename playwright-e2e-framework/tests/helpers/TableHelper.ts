import { Locator, Page } from '@playwright/test';

export class TableHelper {
  private page: Page;
  private tableSelector: string;

  constructor(page: Page, tableSelector: string = 'table, [role="grid"]') {
    this.page = page;
    this.tableSelector = tableSelector;
  }

  static convertToDict(table: any[]): Record<string, string>[] {
    return table.map(row => Object.fromEntries(Object.entries(row)));
  }

  static print(message: string): void {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`  ${message}`);
    console.log(`${'='.repeat(50)}\n`);
  }

  /**
   * Select record or row in the table that matches specific text passed in textToFind parameter. If the text is not found in the current page, it will click the "Next" button to go to the next page and repeat the search until it finds the text or reaches the end of the table.
   * @param tableSelector 
   * @param textToFind 
   * @param nextButtonSelector 
   * @returns 
   */
  async selectRecordInTable(
    tableSelector: string,
    textToFind: string,
    nextButtonSelector: string
  ): Promise<boolean> {
    while (true) {
      //Get all rows in table
      const rows = await this.page.$$(tableSelector + ' tr td:nth-child(1)');

      for (const row of rows) {
        const rowText = await row.textContent();
        if (rowText && rowText.includes(textToFind)) {
          console.log(`Text "${textToFind}" found in table.`);
          await this.page.getByRole('gridcell', { name: textToFind, exact: true }).click();
          return true; //Text found, exit the loop
        }
      }


      //Check if the "Next" button is enabled
      const isNextEnabled = await this.page.isEnabled(nextButtonSelector);
      if (isNextEnabled) {
        //Click the Next Button to go to the next page
        try {
          await this.page.click(nextButtonSelector);
          await this.page.waitForTimeout(5000);
          await this.page.waitForLoadState('networkidle');
        } catch (error) {
          console.error('Error during click: ', error);
        }
      } else {
        console.log(`Text "${textToFind}" not found in the table.`);
        return false;
      }

    }
  }

  /**
   * Select a row in the table by text content
   */
  async selectRowByText(text: string): Promise<void> {
    const row = this.page.locator(`${this.tableSelector} tr`).filter({ hasText: text }).first();
    await row.click();
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Get row by text content
   */
  async getRowByText(text: string): Promise<Locator> {
    return this.page.locator(`${this.tableSelector} tr`).filter({ hasText: text }).first();
  }

  /**
   * Click a button in a specific row 
   */
  async clickButtonInRow(rowText: string, buttonText: string): Promise<void> {
    const row = await this.getRowByText(rowText);
    await row.locator(`button:has-text("${buttonText}")`).click();
  }

  /**
   * Get cell value by row and column index
   */
  async getCellValue(rowIndex: number, columnIndex: number): Promise<string> {
    const cell = this.page.locator(`${this.tableSelector} tr:nth-child(${rowIndex + 1}) td:nth-child(${columnIndex + 1})`);
    return await cell.textContent() || '';
  }

  /**
   * Verify row exists
   */
  async verifyRowExists(text: string): Promise<boolean> {
    const row = this.page.locator(`${this.tableSelector} tr`).filter({ hasText: text }).first();
    return await row.count() > 0;
  }

  /**
   * Get all rows
   */
  async getAllRows(): Promise<Locator> {
    return this.page.locator(`${this.tableSelector} tbody tr`);
  }

  /**
   * Get row count
   */
  async getRowCount(): Promise<number> {
    const rows = await this.getAllRows();
    return await rows.count();
  }
}

