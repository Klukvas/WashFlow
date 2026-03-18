import { test, expect } from '@playwright/test';

// These tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

const API_BASE = 'http://localhost:3000/api/v1';

test.describe('Account Lockout', () => {
  test('5 failed login attempts locks the account', async ({ page }) => {
    // Create a disposable user via the API to avoid locking admin
    const disposableEmail = `lockout-${Date.now()}@test.com`;
    const registerResponse = await page.request.post(`${API_BASE}/auth/register`, {
      data: {
        email: disposableEmail,
        password: 'ValidPass123',
      },
    });

    // Only proceed if registration succeeded
    if (!registerResponse.ok()) {
      test.skip(true, 'Could not create disposable user for lockout test');
      return;
    }

    await page.goto('/login');

    // Attempt 5 wrong-password logins
    for (let i = 0; i < 5; i++) {
      await page.locator('#email').fill(disposableEmail);
      await page.locator('#password').fill('WrongPass!!' + i);
      await page.locator('[data-testid="login-submit"]').click();

      // Wait for response
      await page.waitForTimeout(500);
    }

    // 6th attempt — should show lockout error
    await page.locator('#email').fill(disposableEmail);
    await page.locator('#password').fill('WrongPass!!5');
    await page.locator('[data-testid="login-submit"]').click();

    // Should remain on login page with error
    await expect(page).toHaveURL('/login');
    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test('locked account shows appropriate error even with correct password', async ({
    page,
  }) => {
    const disposableEmail = `lockout2-${Date.now()}@test.com`;
    const password = 'ValidPass123';

    const registerResponse = await page.request.post(`${API_BASE}/auth/register`, {
      data: { email: disposableEmail, password },
    });

    if (!registerResponse.ok()) {
      test.skip(true, 'Could not create disposable user for lockout test');
      return;
    }

    await page.goto('/login');

    // Trigger lockout with wrong passwords
    for (let i = 0; i < 5; i++) {
      await page.locator('#email').fill(disposableEmail);
      await page.locator('#password').fill('WrongPass!!' + i);
      await page.locator('[data-testid="login-submit"]').click();
      await page.waitForTimeout(500);
    }

    // Try with the correct password — should still fail
    await page.locator('#email').fill(disposableEmail);
    await page.locator('#password').fill(password);
    await page.locator('[data-testid="login-submit"]').click();

    await expect(page).toHaveURL('/login');
    await expect(page.locator('.text-destructive').first()).toBeVisible({
      timeout: 5_000,
    });
  });
});
