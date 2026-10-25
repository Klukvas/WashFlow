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
    this.scheduleTab = page.getByRole('tab', { name: /schedule/i });
    this.ordersTab = page.getByRole('tab', { name: /orders/i });
    this.branchSelect = page.locator('#schedule-branch');
    this.datePicker = page.locator('input[type="date"]');
    this.workPostFilter = page.locator('#schedule-post');
    this.scheduleGrid = page.getByTestId('schedule-view');
    this.freeSlots = page.getByTestId('schedule-free-slot');
    this.occupiedSlots = page.getByTestId('schedule-order');
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
    if (await this.branchSelect.isDisabled())
      return this.branchSelect.inputValue();
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
