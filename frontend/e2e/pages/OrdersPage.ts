import { type Page, type Locator } from '@playwright/test';

export class OrdersPage {
  readonly heading: Locator;
  readonly createOrderButton: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /orders/i });
    this.createOrderButton = page.getByRole('button', { name: /create order/i });
    this.tableRows = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto('/orders');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return await this.tableRows.count();
  }

  async clickRow(index: number) {
    await this.tableRows.nth(index).click();
  }
}
