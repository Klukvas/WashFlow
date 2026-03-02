import { type Page, type Locator } from '@playwright/test';

export class ClientsPage {
  readonly heading: Locator;
  readonly addClientButton: Locator;
  readonly tableRows: Locator;
  readonly searchInput: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /clients/i });
    this.addClientButton = page.getByRole('button', { name: 'Create' });
    this.tableRows = page.locator('table tbody tr');
    this.searchInput = page.getByPlaceholder(/search/i);
  }

  async goto() {
    await this.page.goto('/clients');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return await this.tableRows.count();
  }

  async search(query: string) {
    await this.searchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }
}
