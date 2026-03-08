import { type Page, type Locator } from '@playwright/test';

export class ClientDetailPage {
  readonly heading: Locator;
  readonly backButton: Locator;
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly confirmButton: Locator;
  readonly detailsCard: Locator;
  readonly vehiclesCard: Locator;
  readonly quickInfoCard: Locator;

  constructor(private readonly page: Page) {
    this.heading = page.locator('h1').first();
    this.backButton = page.getByRole('button', { name: /back/i });
    this.editButton = page.getByRole('button', { name: /edit/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
    // ConfirmDialog renders inside .fixed.inset-0.z-50 overlay
    this.confirmButton = page
      .locator('.fixed.inset-0.z-50')
      .last()
      .getByRole('button', { name: /confirm|delete/i });
    this.detailsCard = page.getByText(/details/i).first().locator('..').locator('..');
    this.vehiclesCard = page.getByText(/vehicles/i).first().locator('..').locator('..');
    this.quickInfoCard = page.getByText(/quick info/i).first().locator('..').locator('..');
  }

  async goto(id: string) {
    await this.page.goto(`/clients/${id}`);
    await this.page.waitForLoadState('networkidle');
  }

  async navigateFromList() {
    await this.page.goto('/clients');
    await this.page.waitForLoadState('networkidle');
    await this.page.locator('table tbody tr').first().click();
    await this.page.waitForLoadState('networkidle');
  }
}
