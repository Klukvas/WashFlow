import { test, expect } from '@playwright/test';
import { PlansPage } from '../pages/PlansPage';

test.describe('Plans Page', () => {
  let plansPage: PlansPage;

  test.beforeEach(async ({ page }) => {
    plansPage = new PlansPage(page);
    await plansPage.goto();
  });

  test('plan cards load (Starter, Business, Enterprise)', async ({ page }) => {
    await expect(plansPage.heading).toBeVisible();

    // Check for plan tier names
    await expect(page.getByText(/starter/i).first()).toBeVisible();
    await expect(page.getByText(/business/i).first()).toBeVisible();
    await expect(page.getByText(/enterprise/i).first()).toBeVisible();
  });

  test('monthly/yearly toggle changes prices', async ({ page }) => {
    await expect(plansPage.monthlyButton).toBeVisible();
    await expect(plansPage.yearlyButton).toBeVisible();

    // Click Monthly to ensure it's selected, capture price text
    await plansPage.monthlyButton.click();
    await page.waitForTimeout(300);

    // Get all price-like text content
    const monthlyText = await page.locator('body').textContent();

    // Switch to yearly
    await plansPage.yearlyButton.click();
    await page.waitForTimeout(300);

    const yearlyText = await page.locator('body').textContent();

    // The text should differ (prices change between monthly/yearly)
    expect(monthlyText).not.toBe(yearlyText);
  });

  test('current plan is marked', async ({ page }) => {
    // The demo tenant is on TRIAL — "Current Plan" badge should be visible
    const currentPlanBadge = page.getByText(/current plan/i);
    await expect(currentPlanBadge.first()).toBeVisible({ timeout: 5_000 });
  });
});
