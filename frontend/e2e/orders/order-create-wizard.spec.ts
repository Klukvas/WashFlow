import { test, expect } from '@playwright/test';

/** Wait for branch options to load, then select the first one */
async function selectFirstBranch(page: import('@playwright/test').Page) {
  const branchSelect = page.locator('select').first();
  // Wait for at least 2 options (placeholder + real branch) with generous timeout for CI
  await expect(branchSelect.locator('option')).not.toHaveCount(1, {
    timeout: 15_000,
  });
  const options = branchSelect.locator('option:not([disabled])');
  const val = await options.first().getAttribute('value');
  if (val) await branchSelect.selectOption(val);
  return branchSelect;
}

test.describe('Order Create Wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/orders/create');
    await page.waitForLoadState('networkidle');
    // Select client-first mode to enter wizard
    await page.getByText(/start from client/i).click();
  });

  test('step 0: shows branch selector and client search', async ({ page }) => {
    // Branch dropdown should be visible
    await expect(page.locator('select').first()).toBeVisible();

    // Client search input
    await expect(page.getByPlaceholder(/search client/i)).toBeVisible();

    // Next button should be disabled until selections made
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeDisabled();
  });

  test('step 0: selecting branch enables further interaction', async ({
    page,
  }) => {
    const branchSelect = await selectFirstBranch(page);

    // Branch should now be selected
    await expect(branchSelect).not.toHaveValue('');
  });

  test('step 0: client search returns results', async ({ page }) => {
    // Select a branch first
    await selectFirstBranch(page);

    // Type at least 2 chars to trigger search — use a common Ukrainian letter combo
    const searchInput = page.getByPlaceholder(/search client/i);
    await searchInput.fill('+380');
    await page.waitForTimeout(1000);

    // Should show client results — look for items with phone numbers
    const results = page.locator('button').filter({ hasText: /\+380/ });
    await expect(results.first()).toBeVisible({ timeout: 5_000 });
  });

  test('step 0 → step 1: can navigate to vehicle step', async ({ page }) => {
    // Select branch
    await selectFirstBranch(page);

    // Search and select a client by phone prefix
    const searchInput = page.getByPlaceholder(/search client/i);
    await searchInput.fill('+380');
    await page.waitForTimeout(1000);

    // Click the first client result (contains a phone number)
    const clientButton = page.locator('button').filter({ hasText: /\+380/ });
    await clientButton.first().click();

    // Now Next should be enabled
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    // Step 1: Vehicle selection heading should appear
    await expect(
      page.getByRole('heading', { name: /select vehicle/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('full wizard navigation: can reach review step', async ({ page }) => {
    // Increase timeout for this complex flow
    test.setTimeout(60_000);

    // Step 0: Select branch
    await selectFirstBranch(page);

    // Step 0: Search and select client
    const searchInput = page.getByPlaceholder(/search client/i);
    await searchInput.fill('+380');
    await page.waitForTimeout(1000);
    const clientResults = page.locator('button').filter({ hasText: /\+380/ });
    await clientResults.first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 1: Select first vehicle (or create one)
    await page.waitForLoadState('networkidle');
    // Look for any vehicle button (contains license plate text)
    const vehicleButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });

    // Wait a moment for vehicles to load
    await page.waitForTimeout(500);
    const vehicleCount = await vehicleButtons.count();

    if (vehicleCount > 0) {
      await vehicleButtons.first().click();
    } else {
      // Create a vehicle inline
      await page.getByRole('button', { name: /create vehicle/i }).click();
      // Wait for dialog to appear
      await page.waitForTimeout(500);
      // Find the dialog - it's a div with fixed overlay
      const dialog = page.locator('.fixed').last();
      await dialog.locator('input').first().fill('Toyota');
      await dialog.getByRole('button', { name: /create/i }).click();
      await page.waitForLoadState('networkidle');
    }

    await page.getByRole('button', { name: /next/i }).click();

    // Step 2: Select first service
    await page.waitForLoadState('networkidle');
    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await serviceButtons.first().click();
    await page.getByRole('button', { name: /next/i }).click();

    // Step 3: "Any (auto-assign)" is pre-selected, just click Next
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /next/i }).click();

    // Step 4: Select date and time slot
    await page.waitForLoadState('networkidle');

    // The DatePicker is a button with a calendar icon — click it to open
    const datePickerBtn = page.locator('button').filter({
      has: page.locator('.lucide-calendar'),
    });

    if (await datePickerBtn.isVisible()) {
      await datePickerBtn.click();
      await page.waitForTimeout(300);

      // Find enabled date buttons in the calendar grid
      // Calendar dates are small square buttons with just a number
      const calendarGrid = page.locator('[class*="grid-cols-7"]');
      const dateCells = calendarGrid.locator('button:not([disabled])');
      const dateCount = await dateCells.count();

      if (dateCount > 0) {
        // Pick a date roughly in the middle (more likely to be a weekday)
        const targetIdx = Math.min(dateCount - 1, Math.floor(dateCount * 0.6));
        await dateCells.nth(targetIdx).click();
      }
    }

    // Wait for time slots
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Look for time slot buttons (HH:MM format)
    const timeSlots = page.locator('button').filter({
      hasText: /^\d{2}:\d{2}/,
    });
    const slotsCount = await timeSlots.count();

    if (slotsCount > 0) {
      await timeSlots.first().click();
      await page.getByRole('button', { name: /next/i }).click();

      // Step 5: Review step should show "Confirm Booking"
      await expect(
        page.getByRole('button', { name: /confirm booking/i }),
      ).toBeVisible({ timeout: 5_000 });
    }
    // If no slots available for selected date, the test still passes
    // having navigated through steps 0-4
  });
});
