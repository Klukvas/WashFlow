import { type Page, type Locator } from '@playwright/test';

export class RolesPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /roles/i });
    this.createButton = page.getByRole('button', { name: /create/i });
    this.tableRows = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto('/roles');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return this.tableRows.count();
  }

  async clickRow(index: number) {
    await this.tableRows.nth(index).click();
  }
}
