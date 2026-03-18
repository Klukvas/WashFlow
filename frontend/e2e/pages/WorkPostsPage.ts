import { type Page, type Locator } from '@playwright/test';

export class WorkPostsPage {
  readonly heading: Locator;
  readonly createButton: Locator;
  readonly tableRows: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /work posts/i });
    this.createButton = page.getByRole('button', { name: /add work post/i });
    this.tableRows = page.locator('table tbody tr');
  }

  async goto() {
    await this.page.goto('/work-posts');
    await this.page.waitForLoadState('networkidle');
  }

  async getRowCount() {
    return await this.tableRows.count();
  }
}
