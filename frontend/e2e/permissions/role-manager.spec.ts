import { test, expect } from '@playwright/test';

test.describe('Manager Role Permissions', () => {
  test('sidebar shows analytics and audit links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');

    // Manager has analytics.view and audit.read
    await expect(sidebar.getByText(/analytics/i)).toBeVisible();
    await expect(sidebar.getByText(/audit/i)).toBeVisible();
  });

  test('can access analytics page', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('heading', { name: /analytics/i }),
    ).toBeVisible();
  });

  test('can access audit page', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible();
  });

  test('can access users page', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible();
  });

  test('sidebar hides subscription link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    // Manager does NOT have tenants.read so subscription hidden
    await expect(sidebar.getByText(/subscription/i)).not.toBeVisible();
  });

  test('sidebar hides roles link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    // Manager does NOT have roles.read
    await expect(sidebar.getByText(/^roles$/i)).not.toBeVisible();
  });
});
