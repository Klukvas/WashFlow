import { test as setup, expect } from '@playwright/test';
import { REGISTRATION_STORAGE_STATE } from './constants';

setup('register fresh user', async ({ page }) => {
  const uniqueEmail = `e2e-${Date.now()}@test.com`;
  const password = 'TestPass123';

  await page.goto('/');

  // Click "Start free trial" on landing nav to open register modal
  await page
    .locator('.landing-nav')
    .getByRole('button', { name: /start free trial/i })
    .click();

  // Fill registration form inside the modal
  await page.locator('#email').fill(uniqueEmail);
  await page.locator('#password').fill(password);
  await page.locator('#confirmPassword').fill(password);
  await page.locator('[data-testid="register-submit"]').click();

  // Wait for redirect to dashboard after successful registration
  await page.waitForURL('/dashboard', { timeout: 15_000 });
  await expect(page.locator('body')).toBeVisible();

  await page.context().storageState({ path: REGISTRATION_STORAGE_STATE });
});
