import { test, expect } from '@playwright/test';

test.describe('Logout', () => {
  // Intercept the logout API call so the backend does NOT increment tokenVersion.
  // This prevents invalidating the shared refresh token used by all other tests.
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/logout', (route) =>
      route.fulfill({ status: 200, body: '{}' }),
    );
  });

  test('logout clears auth and redirects to landing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const signOutButton = page.getByRole('button', { name: /sign out/i });
    await signOutButton.click();

    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('after logout, /dashboard redirects to landing', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const signOutButton = page.getByRole('button', { name: /sign out/i });
    await signOutButton.click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Now try to visit /dashboard — should redirect back to landing
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('can log back in after logout', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const signOutButton = page.getByRole('button', { name: /sign out/i });
    await signOutButton.click();
    await expect(page).toHaveURL('/', { timeout: 10_000 });

    // Wait for the auth modal to be visible (AppShell opens it on landing)
    await page.locator('.fixed.inset-0.z-50').waitFor({ state: 'visible', timeout: 5_000 });

    // Fill login form inside the modal
    const modal = page.locator('.fixed.inset-0.z-50');
    await modal.locator('#email').fill('admin@washflow.com');
    await modal.locator('#password').fill('admin123');
    await modal.locator('[data-testid="login-submit"]').click();

    await expect(page).toHaveURL(/\/(dashboard)?$/, { timeout: 10_000 });
  });
});
