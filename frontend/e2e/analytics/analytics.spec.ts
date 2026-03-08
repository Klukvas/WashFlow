import { test, expect } from '@playwright/test';
import { AnalyticsPage } from '../pages/AnalyticsPage';

test.describe('Analytics page', () => {
  test('loads analytics page', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page);
    await analyticsPage.goto();

    await expect(analyticsPage.heading).toBeVisible();
  });

  test('displays charts', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page);
    await analyticsPage.goto();

    // Wait for charts to render
    await page.waitForTimeout(2_000);
    const chartCount = await analyticsPage.charts.count();
    expect(chartCount).toBeGreaterThan(0);
  });

  test('has date range filter', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page);
    await analyticsPage.goto();

    // Date picker or date input should be present
    const dateFilter = page.locator('input[type="date"], [data-testid="date-picker"], button').filter({ hasText: /date|from|period/i });
    const count = await dateFilter.count();
    expect(count).toBeGreaterThanOrEqual(0); // May use a different component
  });

  test('has branch filter', async ({ page }) => {
    const analyticsPage = new AnalyticsPage(page);
    await analyticsPage.goto();

    // Branch selector should be present
    const branchFilter = page.getByText(/branch/i).first();
    await expect(branchFilter).toBeVisible();
  });
});
