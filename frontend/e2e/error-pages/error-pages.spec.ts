import { test, expect } from '@playwright/test';

test.describe('Error pages', () => {
  test('403 page shows Access Denied', async ({ page }) => {
    await page.goto('/403');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('403')).toBeVisible();
    await expect(page.getByText(/access denied/i)).toBeVisible();
  });

  test('403 page Go to Dashboard button navigates home', async ({ page }) => {
    await page.goto('/403');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /go to dashboard/i }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 5_000 });
  });

  test('404 page shows Page Not Found', async ({ page }) => {
    await page.goto('/404');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText(/page not found/i)).toBeVisible();
  });

  test('404 page Go to Dashboard button navigates home', async ({ page }) => {
    await page.goto('/404');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /go to dashboard/i }).click();
    await expect(page).toHaveURL('/dashboard', { timeout: 5_000 });
  });

  test('unknown URL redirects to 404', async ({ page }) => {
    await page.goto('/some-random-nonexistent-url-12345');
    await expect(page).toHaveURL('/404', { timeout: 5_000 });
    await expect(page.getByText('404')).toBeVisible();
  });
});
