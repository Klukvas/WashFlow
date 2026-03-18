import { test, expect } from '@playwright/test';

test.describe('Operator Role Permissions', () => {
  test('sidebar shows permitted links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');

    // Operator should see: dashboard, orders, clients, vehicles, services
    await expect(sidebar.getByText(/orders/i)).toBeVisible();
    await expect(sidebar.getByText(/clients/i)).toBeVisible();
    await expect(sidebar.getByText(/vehicles/i)).toBeVisible();
    await expect(sidebar.getByText(/services/i)).toBeVisible();
  });

  test('sidebar hides subscription link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    // Operator does NOT have tenants.read so subscription is hidden
    await expect(sidebar.getByText(/subscription/i)).not.toBeVisible();
  });

  test('sidebar hides users link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText(/^users$/i)).not.toBeVisible();
  });

  test('sidebar hides analytics link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText(/analytics/i)).not.toBeVisible();
  });

  test('sidebar hides audit link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText(/audit/i)).not.toBeVisible();
  });

  test('sidebar hides roles link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText(/^roles$/i)).not.toBeVisible();
  });

  test('can access orders page', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /orders/i })).toBeVisible();
  });

  test('can access clients page', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /clients/i })).toBeVisible();
  });

  test('cannot access subscription page', async ({ page }) => {
    await page.goto('/subscription');
    // Should redirect to 403 or show access denied
    await page.waitForLoadState('networkidle');

    // Either redirected to /403 or shows access denied
    const url = page.url();
    const accessDenied = page.getByText(/access denied|forbidden|403/i);
    const is403 = url.includes('403');
    const showsError = await accessDenied.isVisible().catch(() => false);

    expect(is403 || showsError || !url.includes('subscription')).toBeTruthy();
  });

  test('can create orders', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Create Order button should be visible
    const createButton = page.getByRole('button', { name: /create order/i });
    await expect(createButton).toBeVisible();
  });
});
