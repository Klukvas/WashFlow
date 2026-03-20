import { test, expect } from '@playwright/test';

test.describe('Manager Role Permissions', () => {
  test('sidebar shows analytics and audit links', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');

    // Manager has analytics.view and audit.read
    // Use longer timeout — bootRefresh may not have completed by networkidle
    await expect(sidebar.getByText(/analytics/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(sidebar.getByText(/audit/i)).toBeVisible({ timeout: 15_000 });
  });

  test('can access analytics page', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /analytics/i })).toBeVisible(
      { timeout: 15_000 },
    );
  });

  test('can access audit page', async ({ page }) => {
    await page.goto('/audit');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /audit/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('can access users page', async ({ page }) => {
    await page.goto('/users');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: /users/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test('sidebar hides subscription link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    // Wait for sidebar to fully render before asserting hidden links
    await expect(sidebar.getByText(/analytics/i)).toBeVisible({
      timeout: 15_000,
    });
    // Manager does NOT have tenants.read so subscription hidden
    await expect(sidebar.getByText(/subscription/i)).not.toBeVisible();
  });

  test('sidebar hides roles link', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const sidebar = page.locator('aside');
    await expect(sidebar.getByText(/analytics/i)).toBeVisible({
      timeout: 15_000,
    });
    // Manager does NOT have roles.read
    await expect(sidebar.getByText(/^roles$/i)).not.toBeVisible();
  });
});
