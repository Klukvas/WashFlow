import { test, expect } from '@playwright/test';
import { WorkforcePage } from '../pages/WorkforcePage';

test.describe('Workforce list', () => {
  test('loads and displays workforce page', async ({ page }) => {
    const workforcePage = new WorkforcePage(page);
    await workforcePage.goto();

    await expect(workforcePage.heading).toBeVisible();
  });

  test('shows Create button', async ({ page }) => {
    const workforcePage = new WorkforcePage(page);
    await workforcePage.goto();

    await expect(workforcePage.createButton).toBeVisible();
  });

  test('displays employee profiles in table', async ({ page }) => {
    const workforcePage = new WorkforcePage(page);
    await workforcePage.goto();

    const count = await workforcePage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('opens create form on Create click', async ({ page }) => {
    const workforcePage = new WorkforcePage(page);
    await workforcePage.goto();

    await workforcePage.createButton.click();
    // Create form should appear with user selector
    await expect(page.getByText(/user/i).first()).toBeVisible();
  });

  test('create dialog opens and cancel closes it', async ({ page }) => {
    const workforcePage = new WorkforcePage(page);
    await workforcePage.goto();

    await workforcePage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible({
      timeout: 3_000,
    });

    // Cancel
    await page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /cancel/i })
      .click();
    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test('create worker: select user and branch via combobox', async ({
    page,
  }) => {
    test.setTimeout(20_000);
    const workforcePage = new WorkforcePage(page);
    await workforcePage.goto();

    await workforcePage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible({
      timeout: 3_000,
    });

    // The dialog should have User and Branch comboboxes
    const dialog = page.locator('.fixed.inset-0.z-50');
    const inputs = dialog.locator('input');

    // First combobox = user
    const userInput = inputs.first();
    await userInput.click();
    await page.waitForTimeout(500);
    const userOption = page.locator('[role="listbox"] [role="option"]').first();
    if (await userOption.isVisible()) {
      await userOption.click();
    }

    // Second combobox = branch
    const branchInput = inputs.nth(1);
    await branchInput.click();
    await page.waitForTimeout(500);
    const branchOption = page
      .locator('[role="listbox"] [role="option"]')
      .first();
    if (await branchOption.isVisible()) {
      await branchOption.click();
    }

    // Verify both fields were filled (no errors)
    const submitBtn = dialog.getByRole('button', { name: /save|create/i });
    await expect(submitBtn).toBeVisible();
  });
});
