import { test, expect } from '@playwright/test';
import { WorkPostsPage } from '../pages/WorkPostsPage';

test.describe('Work Posts list', () => {
  test('loads and displays work posts', async ({ page }) => {
    const workPostsPage = new WorkPostsPage(page);
    await workPostsPage.goto();

    await expect(workPostsPage.heading).toBeVisible();
    const count = await workPostsPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Create button', async ({ page }) => {
    const workPostsPage = new WorkPostsPage(page);
    await workPostsPage.goto();

    await expect(workPostsPage.createButton).toBeVisible();
  });

  test('opens create form on Create click', async ({ page }) => {
    const workPostsPage = new WorkPostsPage(page);
    await workPostsPage.goto();

    await workPostsPage.createButton.click();
    await expect(page.getByRole('textbox', { name: /name/i })).toBeVisible();
  });

  test('create work post: select branch and fill name', async ({ page }) => {
    test.setTimeout(15_000);
    const workPostsPage = new WorkPostsPage(page);
    await workPostsPage.goto();

    await workPostsPage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50')).toBeVisible({
      timeout: 3_000,
    });

    const dialog = page.locator('.fixed.inset-0.z-50');

    // Select branch from <select> dropdown
    const branchSelect = dialog.locator('select').first();
    const options = branchSelect.locator('option');
    const optionCount = await options.count();
    if (optionCount > 1) {
      // Pick the second option (first real branch, not placeholder)
      const value = await options.nth(1).getAttribute('value');
      if (value) await branchSelect.selectOption(value);
    }

    // Fill name
    const uniqueName = `E2EPost ${Date.now()}`;
    await dialog.locator('input[name="name"]').fill(uniqueName);

    // Submit
    const submitBtn = dialog.getByRole('button', { name: /create/i });
    await submitBtn.click();

    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
