import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { AuthModalPage } from '../pages/AuthModalPage';

// These tests run unauthenticated
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Registration', () => {
  let landing: LandingPage;
  let modal: AuthModalPage;

  test.beforeEach(async ({ page }) => {
    landing = new LandingPage(page);
    modal = new AuthModalPage(page);
    await landing.goto();
  });

  test('shows register form via landing modal', async () => {
    await landing.getStartedButton.click();
    await expect(modal.emailInput).toBeVisible();
    await expect(modal.passwordInput).toBeVisible();
    await expect(modal.confirmPasswordInput).toBeVisible();
    await expect(modal.registerSubmit).toBeVisible();
  });

  test('validates empty form submission', async ({ page }) => {
    await landing.getStartedButton.click();
    await modal.submitRegister();

    // Form should not navigate away — stays on landing
    await expect(page).toHaveURL('/');
  });

  test('validates password mismatch', async () => {
    await landing.getStartedButton.click();
    await modal.fillRegister('test@example.com', 'Password123', 'Different123');
    await modal.submitRegister();

    // Should show password mismatch error
    await expect(modal.errorMessage.first()).toBeVisible({ timeout: 5_000 });
  });

  test('validates email format', async ({ page }) => {
    await landing.getStartedButton.click();
    await modal.fillRegister('not-an-email', 'Password123', 'Password123');
    await modal.submitRegister();

    // Should stay on landing page
    await expect(page).toHaveURL('/');
  });

  test('successful registration redirects to dashboard', async ({ page }) => {
    const uniqueEmail = `e2e-reg-${Date.now()}@test.com`;

    await landing.getStartedButton.click();
    await modal.fillRegister(uniqueEmail, 'TestPass123', 'TestPass123');
    await modal.submitRegister();

    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 });
  });

  test('duplicate email shows conflict error', async ({ page }) => {
    // admin@washflow.com already exists in seed
    await landing.getStartedButton.click();
    await modal.fillRegister(
      'admin@washflow.com',
      'TestPass123',
      'TestPass123',
    );
    await modal.submitRegister();

    // Wait for the error to appear
    await expect(modal.errorMessage.first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL('/');
  });

  test('switch from register to login form', async () => {
    await landing.getStartedButton.click();
    await expect(modal.registerSubmit).toBeVisible();

    // Click "Sign in" link to switch
    await modal.switchToLoginLink.click();
    await expect(modal.loginSubmit).toBeVisible();
    await expect(modal.confirmPasswordInput).not.toBeVisible();
  });

  test('switch from login to register form', async () => {
    await landing.signInButton.click();
    await expect(modal.loginSubmit).toBeVisible();

    // Click "Register" link to switch
    await modal.switchToRegisterLink.click();
    await expect(modal.registerSubmit).toBeVisible();
    await expect(modal.confirmPasswordInput).toBeVisible();
  });
});
