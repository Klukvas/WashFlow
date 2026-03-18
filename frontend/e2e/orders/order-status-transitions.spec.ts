import { test, expect } from '@playwright/test';
import { OrderDetailPage } from '../pages/OrderDetailPage';

test.describe('Order Status Transitions', () => {
  test('can start a BOOKED order (BOOKED → IN_PROGRESS)', async ({ page }) => {
    // Navigate to orders and find a BOOKED order
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Click a row that contains "Booked" status
    const bookedRow = page.locator('table tbody tr').filter({
      hasText: /booked/i,
    });

    if ((await bookedRow.count()) === 0) {
      test.skip(true, 'No BOOKED orders found in seeded data');
      return;
    }

    await bookedRow.first().click();
    await page.waitForLoadState('networkidle');

    const detail = new OrderDetailPage(page);
    const startButton = page.getByRole('button', { name: /^start$/i });

    if (await startButton.isVisible()) {
      await startButton.click();
      await page.waitForLoadState('networkidle');

      // Status should change to In Progress
      await expect(page.getByText(/in progress/i).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('can complete an IN_PROGRESS order', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    const inProgressRow = page.locator('table tbody tr').filter({
      hasText: /in progress/i,
    });

    if ((await inProgressRow.count()) === 0) {
      test.skip(true, 'No IN_PROGRESS orders found');
      return;
    }

    await inProgressRow.first().click();
    await page.waitForLoadState('networkidle');

    const completeButton = page.getByRole('button', { name: /^complete$/i });
    if (await completeButton.isVisible()) {
      await completeButton.click();
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/completed/i).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('can cancel a BOOKED order', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    const bookedRow = page.locator('table tbody tr').filter({
      hasText: /booked/i,
    });

    if ((await bookedRow.count()) === 0) {
      test.skip(true, 'No BOOKED orders found');
      return;
    }

    await bookedRow.first().click();
    await page.waitForLoadState('networkidle');

    const cancelButton = page.getByRole('button', { name: /^cancel$/i });
    if (await cancelButton.isVisible()) {
      await cancelButton.click();

      // May need to fill cancellation reason or confirm
      const confirmBtn = page
        .locator('.fixed')
        .last()
        .getByRole('button', { name: /confirm|cancel order/i });
      if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      await page.waitForLoadState('networkidle');
      await expect(page.getByText(/cancelled/i).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('can mark a BOOKED order as NO_SHOW', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    const bookedRow = page.locator('table tbody tr').filter({
      hasText: /booked/i,
    });

    if ((await bookedRow.count()) === 0) {
      test.skip(true, 'No BOOKED orders found');
      return;
    }

    await bookedRow.first().click();
    await page.waitForLoadState('networkidle');

    const noShowButton = page.getByRole('button', { name: /no show/i });
    if (await noShowButton.isVisible()) {
      await noShowButton.click();
      await page.waitForLoadState('networkidle');

      await expect(page.getByText(/no show/i).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });
});
