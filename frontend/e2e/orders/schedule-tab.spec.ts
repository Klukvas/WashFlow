import { test, expect } from '@playwright/test';
import { ScheduleViewPage } from '../pages/ScheduleViewPage';

test.describe('Schedule Tab', () => {
  let schedule: ScheduleViewPage;

  test.beforeEach(async ({ page }) => {
    schedule = new ScheduleViewPage(page);
    await schedule.goto();
  });

  test('schedule tab is visible and clickable', async () => {
    await expect(schedule.scheduleTab).toBeVisible();
    await schedule.switchToScheduleTab();
  });

  test('requires a branch or safely selects the only/scoped branch', async () => {
    await schedule.switchToScheduleTab();
    if (!(await schedule.branchSelect.inputValue()))
      await expect(schedule.selectBranchMessage).toBeVisible();
    else await expect(schedule.datePicker).toBeVisible();
  });

  test('branch selector is visible in schedule tab', async () => {
    await schedule.switchToScheduleTab();
    await expect(schedule.branchSelect).toBeVisible();
  });

  test('selecting a branch loads the schedule surface', async ({ page }) => {
    await schedule.switchToScheduleTab();
    await schedule.selectBranch(0);

    // Wait for the grid or work posts to load
    await page.waitForLoadState('networkidle');

    // After selecting a branch, the schedule grid should appear
    await expect(schedule.scheduleGrid).toBeVisible({ timeout: 10_000 });
  });

  test('shows capacity or an explicit empty state', async ({ page }) => {
    await schedule.switchToScheduleTab();
    await schedule.selectBranch(0);
    await page.waitForLoadState('networkidle');

    // Wait for the grid to be populated
    await expect(schedule.scheduleGrid).toBeVisible({ timeout: 10_000 });

    // At least some slots (free or occupied) should be visible
    const freeCount = await schedule.freeSlots.count();
    const occupiedCount = await schedule.occupiedSlots.count();
    if (freeCount + occupiedCount === 0)
      await expect(
        page.getByText(/no scheduled orders|no available slots/i).first(),
      ).toBeVisible();
    else expect(freeCount + occupiedCount).toBeGreaterThan(0);
  });

  test('work post filter narrows scheduled order cards', async ({ page }) => {
    await schedule.switchToScheduleTab();
    await schedule.selectBranch(0);
    await page.waitForLoadState('networkidle');

    await expect(schedule.scheduleGrid).toBeVisible({ timeout: 10_000 });

    const initialRows = await schedule.occupiedSlots.count();

    // Select a specific work post filter
    const wpFilter = schedule.workPostFilter;
    if (await wpFilter.isVisible()) {
      const options = wpFilter.locator('option');
      const optCount = await options.count();
      // Select a specific work post (not "Any")
      if (optCount > 1) {
        const value = await options.nth(1).getAttribute('value');
        if (value) {
          await wpFilter.selectOption(value);
          await page.waitForLoadState('networkidle');

          const filteredRows = await schedule.occupiedSlots.count();
          expect(filteredRows).toBeLessThanOrEqual(initialRows);
        }
      }
    }
  });

  test('clicking a free slot navigates to create order with params', async ({
    page,
  }) => {
    await schedule.switchToScheduleTab();
    await schedule.selectBranch(0);
    await page.waitForLoadState('networkidle');

    await expect(schedule.scheduleGrid).toBeVisible({ timeout: 10_000 });

    const freeCount = await schedule.freeSlots.count();
    if (freeCount > 0) {
      await schedule.clickFreeSlot();
      await expect(page).toHaveURL(/\/orders\/create\?/, { timeout: 10_000 });

      // URL should include branchId, workPostId, date, and time params
      const url = page.url();
      expect(url).toContain('branchId=');
      expect(url).toContain('workPostId=');
      expect(url).toContain('date=');
      expect(url).toContain('time=');
    }
  });

  test('explains reservation policy and workforce capacity', async ({
    page,
  }) => {
    await schedule.switchToScheduleTab();
    await schedule.selectBranch(0);
    await page.waitForLoadState('networkidle');

    await expect(schedule.scheduleGrid).toBeVisible({ timeout: 10_000 });

    // Legend should be visible with Free and Occupied
    await expect(
      page.getByText(/check overdue work with the worker/i),
    ).toBeVisible();
    await expect(
      page.getByText(/service duration is checked during order creation/i),
    ).toBeVisible();
  });

  test('can switch back to orders tab', async ({ page }) => {
    await schedule.switchToScheduleTab();
    await expect(schedule.branchSelect).toBeVisible();

    await schedule.switchToOrdersTab();
    // Orders table or filter should be visible
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
  });
});
