import { type Page, type Locator } from '@playwright/test';

export class LandingPage {
  readonly signInButton: Locator;
  readonly getStartedButton: Locator;
  readonly goToPlatformButton: Locator;
  readonly heroHeading: Locator;
  readonly heroCtaButton: Locator;
  readonly featuresSection: Locator;
  readonly pricingSection: Locator;

  constructor(private readonly page: Page) {
    this.signInButton = page
      .locator('header')
      .getByRole('button', { name: /sign in/i });
    this.getStartedButton = page
      .locator('header')
      .getByRole('button', { name: /get started/i });
    this.goToPlatformButton = page
      .locator('header')
      .getByRole('button', { name: /go to platform/i });
    this.heroHeading = page.locator('section h1').first();
    this.heroCtaButton = page.getByRole('button', {
      name: /start free trial/i,
    });
    this.featuresSection = page.locator('#features');
    this.pricingSection = page.locator('#pricing');
  }

  async goto() {
    await this.page.goto('/');
  }
}
