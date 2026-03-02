import { type Page, type Locator } from '@playwright/test';

export class DashboardPage {
  readonly kpiCards: Locator;
  readonly statsCards: Locator;
  readonly liveOperationsPanel: Locator;
  readonly branchPerformanceTable: Locator;
  readonly employeePerformanceTable: Locator;
  readonly alertsPanel: Locator;

  constructor(private readonly page: Page) {
    this.kpiCards = page.locator('.grid').first();
    this.statsCards = page.locator('.grid').nth(1);
    this.liveOperationsPanel = page.getByText('Live Operations').locator('..');
    this.branchPerformanceTable = page.getByText('Branch Performance').locator('..');
    this.employeePerformanceTable = page.getByText('Employee Performance').locator('..');
    this.alertsPanel = page.getByText('Alerts').first().locator('..');
  }

  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  async getKpiCardTexts() {
    return this.page.locator('.grid').first().locator('[class*="CardContent"], [class*="p-4"]').allTextContents();
  }
}
