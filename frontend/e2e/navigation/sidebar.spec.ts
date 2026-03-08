import { test, expect } from '@playwright/test';

test.describe('Sidebar navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('admin sees subscription link', async ({ page }) => {
    const subscriptionLink = page.locator('aside a[href="/subscription"]');
    await expect(subscriptionLink).toBeVisible();
  });

  test('dashboard link is visible', async ({ page }) => {
    const dashboardLink = page.locator('aside a[href="/"]');
    await expect(dashboardLink).toBeVisible();
  });

  test('clients link is visible', async ({ page }) => {
    const clientsLink = page.locator('aside a[href="/clients"]');
    await expect(clientsLink).toBeVisible();
  });

  test('how-to link is visible', async ({ page }) => {
    const howToLink = page.locator('aside a[href="/how-to"]');
    await expect(howToLink).toBeVisible();
  });

  test('clicking sidebar link navigates correctly', async ({ page }) => {
    const clientsLink = page.locator('aside a[href="/clients"]');
    await clientsLink.click();
    await expect(page).toHaveURL('/clients', { timeout: 5_000 });
  });
});
