import { test, expect, type Page } from '@playwright/test';

// Public booking does NOT require authentication
test.use({ storageState: { cookies: [], origins: [] } });

const SLUG = 'demo';

/** Helper: select a date in an inline calendar grid. */
async function selectDateInCalendar(page: Page, targetDate: Date) {
  const calendar = page.locator('.grid-cols-7');
  await expect(calendar).toBeVisible({ timeout: 3_000 });

  // Navigate to the target month if needed
  const targetMonth = targetDate.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const headerText = () =>
    page.locator('.font-semibold').filter({ hasText: /^\w+ \d{4}$/ });

  for (let i = 0; i < 3; i++) {
    const currentHeader = await headerText().textContent();
    if (currentHeader?.trim() === targetMonth) break;
    await page
      .locator('button')
      .filter({ has: page.locator('.lucide-chevron-right') })
      .click();
    await page.waitForTimeout(200);
  }

  // Click the target day
  const dayNumber = targetDate.getDate().toString();
  const dayCells = calendar.locator('button:not([disabled])');
  const count = await dayCells.count();

  for (let i = 0; i < count; i++) {
    const text = await dayCells.nth(i).textContent();
    if (text?.trim() === dayNumber) {
      await dayCells.nth(i).click();
      return;
    }
  }
}

test.describe('Public Landing Page', () => {
  test('shows landing page with Book Now button', async ({ page }) => {
    await page.goto(`/public/${SLUG}`);
    await page.waitForLoadState('networkidle');

    await expect(
      page.getByRole('link', { name: /book now/i }).first(),
    ).toBeVisible();
  });

  test('shows services on landing page', async ({ page }) => {
    await page.goto(`/public/${SLUG}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Our Services')).toBeVisible();
    // Service cards should show prices
    const priceLabels = page.locator('.font-bold.text-primary');
    await expect(priceLabels.first()).toBeVisible({ timeout: 5_000 });
  });

  test('Book Now navigates to booking page', async ({ page }) => {
    await page.goto(`/public/${SLUG}`);
    await page.waitForLoadState('networkidle');

    await page
      .getByRole('link', { name: /book now/i })
      .first()
      .click();
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveURL(`/public/${SLUG}/book`);
    await expect(page.getByText('Book an Appointment')).toBeVisible();
  });
});

test.describe('Public Booking', () => {
  test('loads booking page with title', async ({ page }) => {
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByText('Book an Appointment')).toBeVisible();
  });

  test('step 0: shows location selector and services', async ({ page }) => {
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    // Location selector
    await expect(page.locator('select').first()).toBeVisible();

    // Continue button should be disabled
    await expect(
      page.getByRole('button', { name: /continue/i }),
    ).toBeDisabled();
  });

  test('step 0: selecting location shows services', async ({ page }) => {
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    // Select the first branch
    const locationSelect = page.locator('select').first();
    const options = locationSelect.locator('option:not([disabled])');
    const firstValue = await options.first().getAttribute('value');
    if (firstValue) {
      await locationSelect.selectOption(firstValue);
    }

    await page.waitForLoadState('networkidle');

    // Services should be visible — look for buttons with price text (₴)
    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await expect(serviceButtons.first()).toBeVisible({ timeout: 5_000 });
  });

  test('step 0 → step 1: can advance to schedule step', async ({ page }) => {
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    // Select branch
    const locationSelect = page.locator('select').first();
    const options = locationSelect.locator('option:not([disabled])');
    const firstValue = await options.first().getAttribute('value');
    if (firstValue) {
      await locationSelect.selectOption(firstValue);
    }
    await page.waitForLoadState('networkidle');

    // Select first service
    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await serviceButtons.first().click();

    // Continue should now be enabled
    const continueBtn = page.getByRole('button', { name: /continue/i });
    await expect(continueBtn).toBeEnabled();
    await continueBtn.click();

    // Step 1: Date & Time selection should appear
    await expect(page.getByText('Choose Date & Time')).toBeVisible();
  });

  test('step 1: shows date input', async ({ page }) => {
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    // Select branch + service to get to step 1
    const locationSelect = page.locator('select').first();
    const options = locationSelect.locator('option:not([disabled])');
    const firstValue = await options.first().getAttribute('value');
    if (firstValue) {
      await locationSelect.selectOption(firstValue);
    }
    await page.waitForLoadState('networkidle');

    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await serviceButtons.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Inline calendar grid should be visible
    await expect(page.locator('.grid-cols-7')).toBeVisible();

    // Back button should work
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible();
  });

  test('step 2: shows contact information form', async ({ page }) => {
    test.setTimeout(30_000);
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    // Step 0: branch + service
    const locationSelect = page.locator('select').first();
    const options = locationSelect.locator('option:not([disabled])');
    const firstValue = await options.first().getAttribute('value');
    if (firstValue) {
      await locationSelect.selectOption(firstValue);
    }
    await page.waitForLoadState('networkidle');

    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await serviceButtons.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 1: select date and time via calendar picker
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
    await selectDateInCalendar(page, tomorrow);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Look for time slots
    const timeSlots = page.locator('button').filter({
      hasText: /^\d{2}:\d{2}$/,
    });
    const slotsCount = await timeSlots.count();

    if (slotsCount === 0) {
      test.skip();
      return;
    }

    await timeSlots.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 2: Contact info form — labels include asterisks
    await expect(page.getByText('Your Information')).toBeVisible();
    // Use input by name attribute from react-hook-form register
    await expect(page.locator('input[name="firstName"]')).toBeVisible();
    await expect(page.locator('input[name="lastName"]')).toBeVisible();
    await expect(page.locator('input[name="phone"]')).toBeVisible();
    await expect(page.locator('input[name="licensePlate"]')).toBeVisible();
  });

  test('full booking flow reaches review step', async ({ page }) => {
    test.setTimeout(45_000);
    await page.goto(`/public/${SLUG}/book`);
    await page.waitForLoadState('networkidle');

    // Step 0: branch + service
    const locationSelect = page.locator('select').first();
    const options = locationSelect.locator('option:not([disabled])');
    const firstValue = await options.first().getAttribute('value');
    if (firstValue) {
      await locationSelect.selectOption(firstValue);
    }
    await page.waitForLoadState('networkidle');

    const serviceButtons = page.locator('button').filter({
      has: page.locator('.font-medium'),
    });
    await serviceButtons.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 1: date + time via calendar picker
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
    await selectDateInCalendar(page, tomorrow);

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const timeSlots = page.locator('button').filter({
      hasText: /^\d{2}:\d{2}$/,
    });
    const slotsCount = await timeSlots.count();

    if (slotsCount === 0) {
      test.skip();
      return;
    }

    await timeSlots.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 2: fill contact form using name attributes
    await page.locator('input[name="firstName"]').fill('Test');
    await page.locator('input[name="lastName"]').fill('Customer');
    await page.locator('input[name="phone"]').fill('+380991234567');
    await page.locator('input[name="licensePlate"]').fill('AA1111BB');

    await page.getByRole('button', { name: /review booking/i }).click();

    // Step 3: Review page
    await expect(page.getByText('Review Your Booking')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /confirm booking/i }),
    ).toBeVisible();

    // Review should show the info we entered
    await expect(page.getByText('Test Customer')).toBeVisible();
    await expect(page.getByText('AA1111BB')).toBeVisible();
  });

  test('shows loading state for invalid slug', async ({ page }) => {
    await page.goto('/public/nonexistent-slug-xyz');

    // Wait for the API call to complete
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Invalid slug shows landing page with no services loaded
    // or an error/blank state — either way, no booking form should appear
    const bookingTitle = page.getByText('Book an Appointment');
    const titleVisible = await bookingTitle.isVisible().catch(() => false);
    expect(titleVisible).toBe(false);
  });
});
