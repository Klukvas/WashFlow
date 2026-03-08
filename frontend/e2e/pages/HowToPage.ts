import { type Page, type Locator } from '@playwright/test';

export class HowToPage {
  readonly heading: Locator;
  readonly topicLinks: Locator;
  readonly contentArea: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole('heading', { name: /how-to/i });
    this.topicLinks = page.locator('nav a[href^="/how-to/"]');
    this.contentArea = page.locator('main .min-w-0.flex-1, main article').first();
  }

  async goto() {
    await this.page.goto('/how-to');
    await this.page.waitForLoadState('networkidle');
  }

  async gotoTopic(slug: string) {
    await this.page.goto(`/how-to/${slug}`);
    await this.page.waitForLoadState('networkidle');
  }
}
