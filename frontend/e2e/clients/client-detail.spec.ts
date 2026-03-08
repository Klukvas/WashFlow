import { test, expect } from '@playwright/test';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { ClientsPage } from '../pages/ClientsPage';

test.describe('Client detail page', () => {
  test('navigates from list to detail URL', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    await expect(page).toHaveURL(/\/clients\/.+/);
  });

  test('shows client name in header', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    const headingText = await detail.heading.textContent();
    expect(headingText?.trim().length).toBeGreaterThan(0);
  });

  test('shows details card with client info', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    await expect(page.getByText(/first name/i)).toBeVisible();
  });

  test('shows vehicles section', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    await expect(page.getByText(/vehicles/i).first()).toBeVisible();
  });

  test('shows Quick Info sidebar', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    await expect(page.getByText(/quick info/i)).toBeVisible();
  });

  test('back button navigates to clients list', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    await detail.backButton.click();
    await expect(page).toHaveURL('/clients', { timeout: 5_000 });
  });

  test('edit toggle shows and hides form fields', async ({ page }) => {
    const detail = new ClientDetailPage(page);
    await detail.navigateFromList();

    // Click Edit
    await detail.editButton.click();
    await expect(page.locator('#firstName')).toBeVisible({ timeout: 3_000 });

    // Click Cancel to hide
    await page.getByRole('button', { name: /cancel/i }).click();
    await expect(page.locator('#firstName')).not.toBeVisible({ timeout: 3_000 });
  });

  test('delete flow: create temp client, delete, and redirect', async ({ page }) => {
    test.setTimeout(30_000);

    // Create a temp client via the list page
    const clientsPage = new ClientsPage(page);
    await clientsPage.goto();

    const uniqueName = `E2EDelete ${Date.now()}`;
    await clientsPage.addClientButton.click();
    await page.locator('#firstName').fill(uniqueName);
    // Submit the create form
    const submitBtn = page
      .locator('.fixed.inset-0.z-50')
      .getByRole('button', { name: /create/i });
    await submitBtn.click();

    // Wait for the dialog to close (new client created)
    await expect(page.locator('#firstName')).not.toBeVisible({ timeout: 5_000 });
    await page.waitForLoadState('networkidle');

    // Navigate to the new client (search for it)
    await clientsPage.search(uniqueName);
    await page.waitForTimeout(1_000);
    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/clients\/.+/, { timeout: 5_000 });

    // Delete the client
    const detail = new ClientDetailPage(page);
    await detail.deleteButton.click();
    await detail.confirmButton.click();

    // Should redirect back to clients list
    await expect(page).toHaveURL('/clients', { timeout: 5_000 });
  });
});
