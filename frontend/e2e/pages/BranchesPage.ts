import { type Page, type Locator } from '@playwright/test';

export class BranchesPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /branches/i });
    this.createButton = page.getByRole('button', { name: 'Create' });
    this.tableRows = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto('/branches');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return await this.tableRows.count();
  }
}
