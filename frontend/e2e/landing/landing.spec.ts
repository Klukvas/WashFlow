import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/LandingPage';
import { AuthModalPage } from '../pages/AuthModalPage';

test.describe('Landing Page (unauthenticated)', () => {
  // Run these unauthenticated
  test.use({ storageState: { cookies: [], origins: [] } });

  test('shows hero section with heading', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.heroHeading).toBeVisible();
    await expect(landing.signInButton).toBeVisible();
    await expect(landing.getStartedButton).toBeVisible();
  });

  test('clicking Sign In opens login modal', async ({ page }) => {
    const landing = new LandingPage(page);
    const modal = new AuthModalPage(page);
    await landing.goto();

    await landing.signInButton.click();
    await expect(modal.loginSubmit).toBeVisible();
  });

  test('clicking Get Started opens register modal', async ({ page }) => {
    const landing = new LandingPage(page);
    const modal = new AuthModalPage(page);
    await landing.goto();

    await landing.getStartedButton.click();
    await expect(modal.registerSubmit).toBeVisible();
  });

  test('hero CTA opens register modal', async ({ page }) => {
    const landing = new LandingPage(page);
    const modal = new AuthModalPage(page);
    await landing.goto();

    await landing.heroCtaButton.click();
    await expect(modal.registerSubmit).toBeVisible();
  });

  test('WashFlow branding is visible in header', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(page.getByText('WashFlow', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Powered by FluxLab').first()).toBeVisible();
  });
});

test.describe('Landing Page (authenticated)', () => {
  test('authenticated user sees Go to Platform button', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await expect(landing.goToPlatformButton).toBeVisible();
    await expect(landing.signInButton).not.toBeVisible();
  });

  test('Go to Platform navigates to dashboard', async ({ page }) => {
    const landing = new LandingPage(page);
    await landing.goto();

    await landing.goToPlatformButton.click();
    await expect(page).toHaveURL('/dashboard', { timeout: 10_000 });
  });
});
