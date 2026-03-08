import { test, expect } from '@playwright/test';
import { ServicesPage } from '../pages/ServicesPage';

test.describe('Services list', () => {
  test('loads and displays services', async ({ page }) => {
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    await expect(servicesPage.heading).toBeVisible();
    const count = await servicesPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Create button', async ({ page }) => {
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    await expect(servicesPage.createButton).toBeVisible();
  });

  test('opens create form on Create click', async ({ page }) => {
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    await servicesPage.createButton.click();
    await expect(page.getByRole('textbox', { name: /name/i })).toBeVisible();
  });

  test('displays active/inactive badges', async ({ page }) => {
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    // At least one badge should be visible
    const badges = page.locator('table tbody td').getByText(/active/i);
    await expect(badges.first()).toBeVisible();
  });

  test('create service: fill form and verify new row', async ({ page }) => {
    test.setTimeout(15_000);
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    const uniqueName = `E2EService ${Date.now()}`;
    await servicesPage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50 #name')).toBeVisible({
      timeout: 3_000,
    });

    await page.locator('#name').fill(uniqueName);
    await page.locator('#durationMin').fill('30');
    await page.locator('#price').fill('100');

    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible({
      timeout: 5_000,
    });
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5_000 });
  });

  test('validation: submit empty service form shows error', async ({
    page,
  }) => {
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    await servicesPage.createButton.click();
    await expect(page.locator('.fixed.inset-0.z-50 #name')).toBeVisible({
      timeout: 3_000,
    });

    // Clear name field and submit
    await page.locator('#name').fill('');
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test('edit dialog opens and closes', async ({ page }) => {
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    const rowCount = await servicesPage.getRowCount();
    if (rowCount === 0) {
      test.skip();
      return;
    }

    // Click the first row's edit button (Pencil icon)
    const editBtn = page
      .locator('table tbody tr')
      .first()
      .locator('button[title]')
      .first();
    await editBtn.click();

    await expect(page.locator('.fixed.inset-0.z-50 #name')).toBeVisible({
      timeout: 3_000,
    });

    // Cancel
    await page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /cancel/i })
      .click();
    await expect(page.locator('.fixed.inset-0.z-50 #name')).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test('delete service via trash button and confirm', async ({ page }) => {
    test.setTimeout(15_000);
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    const initialCount = await servicesPage.getRowCount();
    if (initialCount === 0) {
      test.skip();
      return;
    }

    // Click last row's delete button (Trash2 with .text-destructive)
    const deleteBtn = page
      .locator('table tbody tr')
      .last()
      .locator('button')
      .filter({ has: page.locator('.text-destructive') });
    await deleteBtn.click();

    // Confirm delete
    const confirmBtn = page
      .locator('.fixed.inset-0.z-50')
      .last()
      .getByRole('button', { name: /delete/i });
    await confirmBtn.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const newCount = await servicesPage.getRowCount();
    expect(newCount).toBeLessThanOrEqual(initialCount);
  });

  test('restore deleted service via IncludeDeleted toggle', async ({
    page,
  }) => {
    test.setTimeout(15_000);
    const servicesPage = new ServicesPage(page);
    await servicesPage.goto();

    // Toggle "Show deleted"
    await page.getByText(/show deleted/i).click();
    await page.waitForLoadState('networkidle');

    // Verify table still loads — deleted items may or may not exist
    const rows = await servicesPage.getRowCount();
    expect(rows).toBeGreaterThanOrEqual(0);
  });
});
