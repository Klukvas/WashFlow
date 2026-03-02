import { test, expect } from '@playwright/test';

test.describe('Order Detail', () => {
  test('navigates to order detail and shows order info', async ({ page }) => {
    // Go to orders list first
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Click the first order row
    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/orders\/.+/, { timeout: 5_000 });

    // Order detail page should show key sections
    await expect(page.getByText('Order Details')).toBeVisible();
    await expect(page.getByText('Status').first()).toBeVisible();
    await expect(page.getByText('Services').first()).toBeVisible();
    await expect(page.getByText('Client').first()).toBeVisible();
    await expect(page.getByText('Vehicle').first()).toBeVisible();
    await expect(page.getByText('Schedule').first()).toBeVisible();
  });

  test('shows status transition buttons for BOOKED order', async ({ page }) => {
    // Go to orders list and filter to find a BOOKED order
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Look for a row with "Booked" status badge
    const bookedRow = page
      .locator('table tbody tr')
      .filter({ hasText: /booked/i })
      .first();

    // If no booked order exists, skip
    const count = await bookedRow.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await bookedRow.click();
    await page.waitForLoadState('networkidle');

    // BOOKED orders should have Start, Cancel, No Show buttons
    await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Cancel' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'No Show' }),
    ).toBeVisible();
  });

  test('shows no transition buttons for COMPLETED order', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    const completedRow = page
      .locator('table tbody tr')
      .filter({ hasText: /completed/i })
      .first();

    const count = await completedRow.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await completedRow.click();
    await page.waitForLoadState('networkidle');

    // COMPLETED orders should NOT have transition buttons
    await expect(
      page.getByRole('button', { name: 'Start' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Complete' }),
    ).not.toBeVisible();
  });

  test('displays service list with total price', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await page.waitForLoadState('networkidle');

    // Total Price label should exist in the services section
    await expect(page.getByText('Total Price')).toBeVisible();
  });

  test('shows scheduled start and end times', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Scheduled Start')).toBeVisible();
    await expect(page.getByText('Scheduled End')).toBeVisible();
  });

  test('back button returns to orders list', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await page.locator('table tbody tr').first().click();
    await expect(page).toHaveURL(/\/orders\/.+/, { timeout: 5_000 });

    await page.getByRole('button', { name: /back/i }).click();
    await expect(page).toHaveURL('/orders');
  });
});
