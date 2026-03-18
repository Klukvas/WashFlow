import { type Page, type Locator } from '@playwright/test';

export class PlansPage {
  readonly heading: Locator;
  readonly monthlyButton: Locator;
  readonly yearlyButton: Locator;
  readonly planCards: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /choose a plan/i });
    this.monthlyButton = page.getByRole('button', { name: /monthly/i });
    this.yearlyButton = page.getByRole('button', { name: /yearly/i });
    this.planCards = page.locator('.grid > div').filter({
      has: page.getByRole('button'),
    });
  }

  async goto() {
    await this.page.goto('/subscription/plans');
    await this.page.waitForLoadState('networkidle');
  }
}
