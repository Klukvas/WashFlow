import { test, expect } from '@playwright/test';
import { OrdersPage } from '../pages/OrdersPage';

test.describe('Orders list', () => {
  test('loads and displays orders', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();

    await expect(ordersPage.heading).toBeVisible();
    // Seeded data has >0 orders
    const count = await ordersPage.getRowCount();
    expect(count).toBeGreaterThan(0);
  });

  test('shows Create Order button', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();

    await expect(ordersPage.createOrderButton).toBeVisible();
  });

  test('navigates to Create Order page', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();

    await ordersPage.createOrderButton.click();
    await expect(page).toHaveURL('/orders/create');
  });

  test('navigates to order detail on row click', async ({ page }) => {
    const ordersPage = new OrdersPage(page);
    await ordersPage.goto();

    await ordersPage.clickRow(0);
    await expect(page).toHaveURL(/\/orders\/.+/, { timeout: 5_000 });
  });
});

test.describe('Create Order wizard', () => {
  test('shows 6-step wizard', async ({ page }) => {
    await page.goto('/orders/create');
    await page.waitForLoadState('networkidle');

    // Step indicators: 6 numbered circles
    const stepCircles = page.locator('.flex.h-8.w-8');
    await expect(stepCircles).toHaveCount(6);
  });

  test('next button disabled until branch + client selected', async ({ page }) => {
    await page.goto('/orders/create');
    await page.waitForLoadState('networkidle');

    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeDisabled();
  });
});
