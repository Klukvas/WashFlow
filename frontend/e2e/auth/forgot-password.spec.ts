import { test, expect } from '@playwright/test';
import { ForgotPasswordPage } from '../pages/ForgotPasswordPage';

// These tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Forgot Password', () => {
  let forgotPage: ForgotPasswordPage;

  test.beforeEach(async ({ page }) => {
    forgotPage = new ForgotPasswordPage(page);
    await forgotPage.goto();
  });

  test('shows forgot password form', async () => {
    await expect(forgotPage.heading).toBeVisible();
    await expect(forgotPage.emailInput).toBeVisible();
    await expect(forgotPage.submitButton).toBeVisible();
  });

  test('submits successfully and shows confirmation', async () => {
    await forgotPage.emailInput.fill('admin@washflow.com');
    await forgotPage.submitButton.click();

    await expect(forgotPage.successMessage).toBeVisible({ timeout: 5_000 });
  });

  test('shows success even for non-existent email (no leak)', async () => {
    await forgotPage.emailInput.fill('nonexistent@example.com');
    await forgotPage.submitButton.click();

    // Should still show success to avoid email enumeration
    await expect(forgotPage.successMessage).toBeVisible({ timeout: 5_000 });
  });

  test('navigate to forgot password from login page', async ({ page }) => {
    await page.goto('/login');
    await page.getByText(/forgot password/i).click();

    await expect(page).toHaveURL('/forgot-password');
    await expect(forgotPage.heading).toBeVisible();
  });
});
