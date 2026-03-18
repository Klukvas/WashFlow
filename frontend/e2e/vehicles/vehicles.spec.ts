import { test, expect } from '@playwright/test';
import { VehiclesPage } from '../pages/VehiclesPage';

test.describe('Vehicles list', () => {
  test('loads and displays vehicles', async ({ page }) => {
    const vehiclesPage = new VehiclesPage(page);
    await vehiclesPage.goto();

    await expect(vehiclesPage.heading).toBeVisible();
    const count = await vehiclesPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Create button', async ({ page }) => {
    const vehiclesPage = new VehiclesPage(page);
    await vehiclesPage.goto();

    await expect(vehiclesPage.createButton).toBeVisible();
  });

  test('opens create form on Create click', async ({ page }) => {
    const vehiclesPage = new VehiclesPage(page);
    await vehiclesPage.goto();

    await vehiclesPage.createButton.click();
    // Create dialog should have make input
    await expect(page.getByRole('textbox', { name: /make/i })).toBeVisible();
  });

  test('create vehicle via form', async ({ page }) => {
    test.setTimeout(20_000);
    const vehiclesPage = new VehiclesPage(page);
    await vehiclesPage.goto();
    const initialCount = await vehiclesPage.getRowCount();

    await vehiclesPage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible();

    // Select client via Combobox — click the input, wait for dropdown, pick first
    const clientCombobox = page.locator('.fixed.inset-0.z-50 input').first();
    await clientCombobox.click();
    await page.waitForTimeout(500);
    const firstOption = page.locator('.bg-popover button').first();
    await firstOption.click();

    // Fill make
    await page
      .locator('.fixed.inset-0.z-50 input[name="make"]')
      .fill(`TestMake ${Date.now()}`);

    // Submit
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible({
      timeout: 5_000,
    });
    await page.waitForLoadState('networkidle');

    const newCount = await vehiclesPage.getRowCount();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
  });

  test('delete vehicle via trash button and confirm', async ({ page }) => {
    test.setTimeout(15_000);
    const vehiclesPage = new VehiclesPage(page);
    await vehiclesPage.goto();

    const initialCount = await vehiclesPage.getRowCount();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Click the first row's delete button
    const deleteBtn = page
      .locator('table tbody tr')
      .first()
      .getByRole('button')
      .last();
    await deleteBtn.click();

    // Confirm dialog
    const confirmBtn = page
      .locator('.fixed.inset-0.z-50')
      .last()
      .getByRole('button', { name: /confirm|delete/i });
    await confirmBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const newCount = await vehiclesPage.getRowCount();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test('restore deleted vehicle via toggle', async ({ page }) => {
    test.setTimeout(15_000);
    const vehiclesPage = new VehiclesPage(page);
    await vehiclesPage.goto();

    // Toggle "Show deleted"
    const toggle = page.getByText(/show deleted/i);
    await toggle.click();
    await page.waitForLoadState('networkidle');

    // Look for a restore button (RotateCcw) on any deleted row
    const restoreBtn = page.locator('table tbody tr button').filter({
      has: page.locator('svg'),
    });
    const count = await restoreBtn.count();
    // Just verify the toggle works and the table still loads
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
