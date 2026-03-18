import { type Page, type Locator } from '@playwright/test';

export class ScheduleViewPage {
  readonly scheduleTab: Locator;
  readonly ordersTab: Locator;
  readonly branchSelect: Locator;
  readonly datePicker: Locator;
  readonly workPostFilter: Locator;
  readonly scheduleGrid: Locator;
  readonly freeSlots: Locator;
  readonly occupiedSlots: Locator;
  readonly legend: Locator;
  readonly selectBranchMessage: Locator;

  constructor(private readonly page: Page) {
    this.scheduleTab = page.getByRole('button', { name: /schedule/i }).first();
    this.ordersTab = page.getByRole('button', { name: /^orders$/i }).first();
    this.branchSelect = page.locator('select').first();
    this.datePicker = page.locator('input[type="date"]');
    this.workPostFilter = page.locator('select').nth(1);
    this.scheduleGrid = page.locator('table');
    this.freeSlots = page.getByRole('button', { name: /free/i });
    this.occupiedSlots = page.getByRole('button', { name: /occupied/i });
    this.legend = page.locator('.text-xs.text-muted-foreground').last();
    this.selectBranchMessage = page.getByText(/select a branch/i);
  }

  async goto() {
    await this.page.goto('/orders');
    await this.page.waitForLoadState('networkidle');
  }

  async switchToScheduleTab() {
    await this.scheduleTab.click();
  }

  async switchToOrdersTab() {
    await this.ordersTab.click();
  }

  async selectBranch(index = 0) {
    const options = this.branchSelect.locator('option:not([disabled])');
    const value = await options.nth(index).getAttribute('value');
    if (value) {
      await this.branchSelect.selectOption(value);
    }
    return value;
  }

  async clickFreeSlot() {
    await this.freeSlots.first().click();
  }
}
