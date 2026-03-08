import { type Page, type Locator } from '@playwright/test';

export class BranchDetailPage {
  readonly heading: Locator;
  readonly backButton: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly confirmButton: Locator;
  readonly bookingSettingsCard: Locator;
  readonly workPostsSection: Locator;
  readonly infoCard: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1').first();
    this.backButton = page.getByRole('button', { name: /back/i });
    this.editButton = page.getByRole('button', { name: /edit/i }).first();
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    this.confirmButton = page
      .locator('.fixed.inset-0.z-50')
      .last()
      .getByRole('button', { name: /confirm|delete/i });
    this.bookingSettingsCard = page.getByText(/booking settings/i).first().locator('..').locator('..');
    this.workPostsSection = page.getByText(/work posts/i).first().locator('..').locator('..');
    this.infoCard = page.getByText(/address/i).first().locator('..').locator('..');
  }

  async goto(id: string) {
    await this.page.goto(`/branches/${id}`);
    await this.page.waitForLoadState('networkidle');
  }

  async navigateFromList() {
    await this.page.goto('/branches');
    await this.page.waitForLoadState('networkidle');
    await this.page.locator('table tbody tr').first().click();
    await this.page.waitForLoadState('networkidle');
  }
}
