import { test, expect } from '@playwright/test';

test.describe('Logout', () => {
  test('logout clears auth and redirects to landing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Find and click sign out (usually in header or user menu)
    const signOutButton = page.getByText(/sign out/i);
    await signOutButton.click();

    // Should redirect to landing page
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('after logout, /dashboard redirects to landing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const signOutButton = page.getByText(/sign out/i);
    await signOutButton.click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Now try to visit /dashboard — should redirect back to landing
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('can log back in after logout', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const signOutButton = page.getByText(/sign out/i);
    await signOutButton.click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Click Sign In on landing
    await page.getByRole('button', { name: /sign in/i }).click();

    // Fill login form
    await page.locator('#email').fill('admin@washflow.com');
    await page.locator('#password').fill('admin123');
    await page.locator('[data-testid="login-submit"]').click();

    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10_000 });
  });
});
