import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';

// Env is auto-loaded from .env.test by dotenv
const TENANT_ID = process.env.PLAYWRIGHT_TENANT_ID ?? '00000000-0000-4000-8000-000000000001';
const EMAIL = process.env.PLAYWRIGHT_EMAIL ?? 'admin@washflow.com';
const PASSWORD = process.env.PLAYWRIGHT_PASSWORD ?? 'admin123';

// These tests run without pre-authenticated state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login', () => {
  test('shows login form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Use exact match to avoid matching "Sign in to WashFlow" heading
    await expect(page.getByText('WashFlow', { exact: true })).toBeVisible();
    await expect(loginPage.tenantIdInput).toBeVisible();
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.passwordInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });

  test('redirects to dashboard on valid credentials', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TENANT_ID, EMAIL, PASSWORD);

    await expect(page).toHaveURL('/', { timeout: 10_000 });
  });

  test('returns 401 on invalid credentials and stays on login', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    // Intercept the login API call before clicking submit
    const responsePromise = page.waitForResponse('**/api/v1/auth/login');
    await loginPage.login(TENANT_ID, EMAIL, 'wrong-password');
    const response = await responsePromise;

    expect(response.status()).toBe(401);
    await expect(page).toHaveURL('/login');
  });

  test('blocks submit with invalid email format', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.tenantIdInput.fill(TENANT_ID);
    await loginPage.emailInput.fill('not-an-email');
    await loginPage.passwordInput.fill(PASSWORD);
    await loginPage.submitButton.click();

    // Zod validation prevents submission — stays on /login
    await expect(page).toHaveURL('/login');
  });

  test('blocks submit with invalid UUID tenant', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await loginPage.tenantIdInput.fill('not-a-uuid');
    await loginPage.emailInput.fill(EMAIL);
    await loginPage.passwordInput.fill(PASSWORD);
    await loginPage.submitButton.click();

    await expect(page).toHaveURL('/login');
  });
});
