import { type Page, type Locator } from '@playwright/test';

export class ServicesPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /services/i });
    this.createButton = page.getByRole('button', { name: /add service/i });
    this.tableRows = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto('/services');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return await this.tableRows.count();
  }
}
