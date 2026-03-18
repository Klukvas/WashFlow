import { test, expect } from '@playwright/test';
import { CreateOrderWizardPage } from '../pages/CreateOrderWizardPage';

test.describe('Flexible Order Wizard', () => {
  let wizard: CreateOrderWizardPage;

  test.beforeEach(async ({ page }) => {
    wizard = new CreateOrderWizardPage(page);
    await wizard.goto();
  });

  test('shows mode selector with 3 cards', async () => {
    await expect(wizard.modeClientFirst).toBeVisible();
    await expect(wizard.modeTimeFirst).toBeVisible();
    await expect(wizard.modeServiceFirst).toBeVisible();
  });

  test('client-first mode has 6 steps', async () => {
    await wizard.selectMode('client-first');

    // Step indicator shows 6 circles
    const stepCount = await wizard.getStepCount();
    expect(stepCount).toBe(6);
  });

  test('time-first mode has 7 steps', async () => {
    await wizard.selectMode('time-first');

    const stepCount = await wizard.getStepCount();
    expect(stepCount).toBe(7);
  });

  test('service-first mode has 7 steps', async () => {
    await wizard.selectMode('service-first');

    const stepCount = await wizard.getStepCount();
    expect(stepCount).toBe(7);
  });

  test('can change mode after selection', async () => {
    await wizard.selectMode('client-first');
    const initialCount = await wizard.getStepCount();
    expect(initialCount).toBe(6);

    // Click change mode button
    await wizard.changeModeButton.click();

    // Mode selector should be visible again
    await expect(wizard.modeClientFirst).toBeVisible();

    // Select a different mode
    await wizard.selectMode('time-first');
    const newCount = await wizard.getStepCount();
    expect(newCount).toBe(7);
  });

  test('client-first first step shows branch and client search', async ({
    page,
  }) => {
    await wizard.selectMode('client-first');

    // Should show branch selector and client search
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.getByPlaceholder(/search client/i)).toBeVisible();
  });

  test('time-first first step shows branch selector only', async ({ page }) => {
    await wizard.selectMode('time-first');

    // Should show branch selector
    await expect(page.locator('select').first()).toBeVisible();
    // Should not show client search on first step
    await expect(page.getByPlaceholder(/search client/i)).not.toBeVisible();
  });

  test('service-first first step shows branch selector only', async ({
    page,
  }) => {
    await wizard.selectMode('service-first');

    // Should show branch selector
    await expect(page.locator('select').first()).toBeVisible();
    // Should not show client search on first step
    await expect(page.getByPlaceholder(/search client/i)).not.toBeVisible();
  });

  test('URL prefill auto-selects time-first mode', async ({ page }) => {
    // Navigate with URL params (simulating click from schedule)
    await page.goto(
      '/orders/create?branchId=fake-id&date=2026-03-20&time=10:00&workPostId=fake-wp',
    );
    await page.waitForLoadState('networkidle');

    // Should skip mode selector and show step indicator
    // Mode selector cards should NOT be visible
    await expect(wizard.modeClientFirst).not.toBeVisible();

    // Step indicator should show 7 steps (time-first)
    const stepCount = await wizard.getStepCount();
    expect(stepCount).toBe(7);
  });

  test('client-first: full flow reaches review step', async ({ page }) => {
    test.setTimeout(60_000);

    await wizard.selectMode('client-first');

    // Step 0: Select branch
    const branchSelect = page.locator('select').first();
    const firstOption = branchSelect.locator('option:not([disabled])').first();
    const branchVal = await firstOption.getAttribute('value');
    if (branchVal) await branchSelect.selectOption(branchVal);

    // Search and select a client
    const searchInput = page.getByPlaceholder(/search client/i);
    await searchInput.fill('+380');
    await page.waitForTimeout(1000);

    const clientResults = page.locator('button').filter({ hasText: /\+380/ });
    await clientResults.first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 1: Select vehicle
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const vehicleButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    const vehicleCount = await vehicleButtons.count();
    if (vehicleCount > 0) {
      await vehicleButtons.first().click();
    }
    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Select service
    await page.waitForLoadState('networkidle');
    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await serviceButtons.first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: Worker — "Any (auto-assign)" pre-selected, just Next
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /next/i }).click();

    // Step 4: Date and time slot
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const timeSlots = page.locator('button').filter({
      hasText: /^\d{2}:\d{2}/,
    });
    const slotsCount = await timeSlots.count();

    if (slotsCount > 0) {
      await timeSlots.first().click();
      await page.getByRole('button', { name: /next/i }).click();

      // Step 5: Review — should show Confirm Booking
      await expect(wizard.confirmBookingButton).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test('next button is disabled until required fields are filled', async ({
    page,
  }) => {
    await wizard.selectMode('time-first');

    // On branch step, Next should be disabled without branch selected
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeDisabled();
  });

  test('back button navigates to previous step', async ({ page }) => {
    await wizard.selectMode('time-first');

    // Select branch to enable Next
    const branchSelect = page.locator('select').first();
    const firstOption = branchSelect.locator('option:not([disabled])').first();
    const val = await firstOption.getAttribute('value');
    if (val) await branchSelect.selectOption(val);

    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForLoadState('networkidle');

    // Now click Back — should go to branch step
    // Two Back buttons exist: one in the header breadcrumb, one in step footer
    await page.getByRole('button', { name: /back/i }).last().click();
    await expect(branchSelect).toBeVisible();
  });
});
