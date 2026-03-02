import { type Page, type Locator } from '@playwright/test';

export class OrderDetailPage {
  readonly statusBadge: Locator;
  readonly servicesCard: Locator;
  readonly clientCard: Locator;
  readonly vehicleCard: Locator;
  readonly scheduleCard: Locator;
  readonly backButton: Locator;
  readonly deleteButton: Locator;

  constructor(private readonly page: Page) {
    this.statusBadge = page.locator('[class*="badge"]').first();
    this.servicesCard = page.getByText('Services').first().locator('..').locator('..');
    this.clientCard = page.getByText('Client').first().locator('..').locator('..');
    this.vehicleCard = page.getByText('Vehicle').first().locator('..').locator('..');
    this.scheduleCard = page.getByText('Schedule').first().locator('..').locator('..');
    this.backButton = page.getByRole('button', { name: /back/i });
    this.deleteButton = page.getByRole('button', { name: /delete/i });
  }

  async goto(orderId: string) {
    await this.page.goto(`/orders/${orderId}`);
    await this.page.waitForLoadState('networkidle');
  }

  async getStatusTransitionButtons() {
    return this.page.getByRole('button').filter({
      has: this.page.locator(':text-matches("Confirm|Start|Complete|Cancel|No Show")'),
    });
  }

  async clickStatusButton(label: string) {
    await this.page.getByRole('button', { name: label, exact: true }).click();
  }
}
