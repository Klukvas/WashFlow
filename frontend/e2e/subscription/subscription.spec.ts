import { test, expect } from '@playwright/test';
import { SubscriptionPage } from '../pages/SubscriptionPage';

test.describe('Subscription page', () => {
  test('loads subscription page for admin', async ({ page }) => {
    const subscriptionPage = new SubscriptionPage(page);
    await subscriptionPage.goto();

    await expect(subscriptionPage.heading).toBeVisible();
  });

  test('displays resource usage information', async ({ page }) => {
    const subscriptionPage = new SubscriptionPage(page);
    await subscriptionPage.goto();

    // Should show usage text for at least one resource
    await expect(page.getByText(/users/i).first()).toBeVisible();
    await expect(page.getByText(/branches/i).first()).toBeVisible();
  });

  test('shows subscription link in sidebar for admin', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const subscriptionLink = page.locator('nav a[href="/subscription"]');
    await expect(subscriptionLink).toBeVisible();
  });

  test('displays progress bars for resource limits', async ({ page }) => {
    const subscriptionPage = new SubscriptionPage(page);
    await subscriptionPage.goto();

    // Progress bars should be rendered
    const progressBars = page.locator('[role="progressbar"], .bg-primary');
    const count = await progressBars.count();
    expect(count).toBeGreaterThan(0);
  });
});
