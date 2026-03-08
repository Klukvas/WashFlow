import { type Page, type Locator } from '@playwright/test';

export class SubscriptionPage {
  readonly heading: Locator;
  readonly usageCards: Locator;
  readonly trialBanner: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /subscription/i });
    this.usageCards = page.locator('[data-testid="usage-card"]');
    this.trialBanner = page.locator('[data-testid="trial-banner"]');
  }

  async goto() {
    await this.page.goto('/subscription');
    await this.page.waitForLoadState('networkidle');
  }
}
