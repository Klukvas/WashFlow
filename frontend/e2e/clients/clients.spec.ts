import { test, expect } from '@playwright/test';
import { ClientsPage } from '../pages/ClientsPage';

test.describe('Clients list', () => {
  test('loads and displays clients', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await expect(clientsPage.heading).toBeVisible();
    const count = await clientsPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Add Client button', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await expect(clientsPage.addClientButton).toBeVisible();
  });

  test('opens create form on Create click', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await clientsPage.addClientButton.click();
    // Create form (slide-in panel) with name inputs should appear
    await expect(
      page.getByRole('textbox', { name: 'First Name' }),
    ).toBeVisible();
  });

  test('navigates to client detail on row click', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/clients\/.+/, { timeout: 5_000 });
  });

  test('create client: submit form and verify new row', async ({ page }) => {
    test.setTimeout(15_000);
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    const uniqueName = `AutoTest ${Date.now()}`;
    await clientsPage.addClientButton.click();
    await page.locator('#firstName').fill(uniqueName);

    // Submit
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    // Dialog should close
    await expect(page.locator('.fixed.inset-0.z-50')).not.toBeVisible({
      timeout: 5_000,
    });
    await page.waitForLoadState('networkidle');

    // New row should appear
    await expect(page.getByText(uniqueName)).toBeVisible({ timeout: 5_000 });
  });

  test('validation: submit empty form shows error', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    await clientsPage.addClientButton.click();
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 3_000 });

    // Submit without filling
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    // Error message should appear
    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 3_000,
    });
  });

  test('search filter narrows results', async ({ page }) => {
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    const initialCount = await clientsPage.getRowCount();

    // Search for unlikely string
    await clientsPage.search('zzz_no_match_ever_12345');
    await page.waitForTimeout(1_000);

    const filteredCount = await clientsPage.getRowCount();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);

    // Clear search
    await clientsPage.search('');
    await page.waitForTimeout(1_000);
    const restoredCount = await clientsPage.getRowCount();
    expect(restoredCount).toBeGreaterThan(0);
  });
});
