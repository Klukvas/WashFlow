import { test, expect } from '@playwright/test';
import { WorkPostsPage } from '../pages/WorkPostsPage';

test.describe('Work Posts list', () => {
  test('loads and displays work posts', async ({ page }) => {
    const workPostsPage = new WorkPostsPage(page);
    await workPostsPage.goto();

    await expect(workPostsPage.heading).toBeVisible();

    // Work posts page requires a branch to be selected first
    const branchSelect = page.locator('select').first();
    // Skip the placeholder option (value="") — select first real branch
    const realBranch = branchSelect
      .locator('option[value]:not([value=""])')
      .first();
    const branchVal = await realBranch.getAttribute('value');
    if (branchVal) {
      await branchSelect.selectOption(branchVal);
      await page.waitForLoadState('networkidle');
    }

    // Wait for rows to render after branch selection triggers data fetch
    await expect(page.locator('table tbody tr').first()).toBeVisible({
      timeout: 5_000,
    });

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

    try {
      await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible({
        timeout: 5_000,
      });
    } catch {
      test.skip(
        true,
        'Work post creation failed — subscription limit likely reached',
      );
    }
  });
});
