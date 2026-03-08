import { test, expect } from '@playwright/test';
import { BranchDetailPage } from '../pages/BranchDetailPage';
import { BranchesPage } from '../pages/BranchesPage';

test.describe('Branch detail page', () => {
  test('navigates from list to detail URL', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    await expect(page).toHaveURL(/\/branches\/.+/);
  });

  test('shows branch name in header', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    const headingText = await detail.heading.textContent();
    expect(headingText?.trim().length).toBeGreaterThan(0);
  });

  test('shows info card with address', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    await expect(page.getByText(/address/i).first()).toBeVisible();
  });

  test('shows work posts section', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    await expect(page.getByText(/work posts/i).first()).toBeVisible();
  });

  test('shows booking settings card', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    await expect(page.getByText(/booking settings/i).first()).toBeVisible();
  });

  test('back button navigates to branches list', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    await detail.backButton.click();
    await expect(page).toHaveURL('/branches', { timeout: 5_000 });
  });

  test('edit dialog opens and closes', async ({ page }) => {
    const detail = new BranchDetailPage(page);
    await detail.navigateFromList();

    // Click Edit → dialog with #name visible
    await detail.editButton.click();
    await expect(
      page.locator('.fixed.inset-0.z-50 #name'),
    ).toBeVisible({ timeout: 3_000 });

    // Cancel → dialog closes
    await page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /cancel/i })
      .click();
    await expect(
      page.locator('.fixed.inset-0.z-50 #name'),
    ).not.toBeVisible({ timeout: 3_000 });
  });

  test('delete flow: create temp branch, delete, and redirect', async ({ page }) => {
    test.setTimeout(30_000);

    // Create a temp branch via the list page
    const branchesPage = new BranchesPage(page);
    await branchesPage.goto();

    const uniqueName = `E2EBranch ${Date.now()}`;
    await branchesPage.createButton.click();
    await page.locator('.fixed.inset-0.z-50 #name').fill(uniqueName);

    // Submit
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    // Wait for dialog to close
    await expect(page.locator('.fixed.inset-0.z-50 #name')).not.toBeVisible({
      timeout: 5_000,
    });
    await page.waitForLoadState('networkidle');

    // Find and click the new branch row
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5_000 });
    await page.getByText(uniqueName).click();
    await expect(page).toHaveURL(/\/branches\/.+/, { timeout: 5_000 });

    // Delete
    const detail = new BranchDetailPage(page);
    await detail.deleteButton.click();
    await detail.confirmButton.click();

    // Should redirect back to branches list
    await expect(page).toHaveURL('/branches', { timeout: 5_000 });
  });
});
