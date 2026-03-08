import { type Page, type Locator } from '@playwright/test';

export class AnalyticsPage {
  readonly heading: Locator;
  readonly charts: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /analytics/i });
    this.charts = page.locator('.recharts-responsive-container');
  }

  async goto() {
    await this.page.goto('/analytics');
    await this.page.waitForLoadState('networkidle');
  }
}
