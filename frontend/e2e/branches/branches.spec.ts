import { test, expect } from '@playwright/test';
import { BranchesPage } from '../pages/BranchesPage';

test.describe('Branches list', () => {
  test('loads and displays branches', async ({ page }) => {
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    await expect(branchesPage.heading).toBeVisible();
    const count = await branchesPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Create button', async ({ page }) => {
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    await expect(branchesPage.createButton).toBeVisible();
  });

  test('opens create form on Create click', async ({ page }) => {
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    await branchesPage.createButton.click();
    await expect(page.getByRole('textbox', { name: /name/i })).toBeVisible();
  });

  test('navigates to branch detail on row click', async ({ page }) => {
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/branches\/.+/, { timeout: 5_000 });
  });

  test('create branch: submit form and verify new row', async ({ page }) => {
    test.setTimeout(15_000);
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    const uniqueName = `E2EBranch ${Date.now()}`;
    await branchesPage.createButton.click();
    await page.locator('.fixed.inset-0.z-50 #name').fill(uniqueName);

    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    await expect(page.locator('.fixed.inset-0.z-50 #name')).not.toBeVisible({
      timeout: 5_000,
    });
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5_000 });
  });

  test('validation: submit empty form shows error', async ({ page }) => {
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    await branchesPage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50 #name')).toBeVisible({
      timeout: 3_000,
    });

    // Clear default value and submit empty
    await page.locator('.fixed.inset-0.z-50 #name').fill('');
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 3_000,
    });
  });
});
