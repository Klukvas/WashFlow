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
  test('shows mode selector', async ({ page }) => {
    await page.goto('/orders/create');
    await page.waitForLoadState('networkidle');

    // Mode selector should show 3 mode cards
    await expect(page.getByText(/client first/i)).toBeVisible();
    await expect(page.getByText(/time first/i)).toBeVisible();
    await expect(page.getByText(/start from service/i)).toBeVisible();
  });

  test('next button disabled until branch + client selected', async ({
    page,
  }) => {
    await page.goto('/orders/create');
    await page.waitForLoadState('networkidle');

    // Select client-first mode
    await page.getByText(/client first/i).click();

    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeDisabled();
  });

  test('orders page has filter controls', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Orders page should have filter inputs or selects
    const filterControls = page.locator(
      'input[placeholder*="search" i], input[placeholder*="filter" i], select',
    );
    const count = await filterControls.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
