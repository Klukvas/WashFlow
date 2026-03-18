import { test, expect } from '@playwright/test';

test.describe('Receptionist Role Permissions', () => {
  test('sidebar shows permitted links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');

    // Receptionist should see: orders, clients, vehicles, services
    await expect(sidebar.getByText(/orders/i)).toBeVisible();
    await expect(sidebar.getByText(/clients/i)).toBeVisible();
    await expect(sidebar.getByText(/vehicles/i)).toBeVisible();
    await expect(sidebar.getByText(/services/i)).toBeVisible();
  });

  test('sidebar hides subscription link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText(/subscription/i)).not.toBeVisible();
  });

  test('can view orders (read access)', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
  });

  test('cannot delete orders (no delete permission)', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Navigate to an order detail
    const rows = page.locator('table tbody tr');
    if ((await rows.count()) > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');

      // Delete button should NOT be visible for receptionist
      const deleteButton = page.getByRole('button', { name: /delete/i });
      await expect(deleteButton).not.toBeVisible();
    }
  });

  test('can access clients page', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /clients/i })).toBeVisible();
  });

  test('can create orders', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Receptionist has orders.create permission
    const createButton = page.getByRole('button', { name: /create order/i });
    await expect(createButton).toBeVisible();
  });
});
