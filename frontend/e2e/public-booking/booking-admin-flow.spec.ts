import { test, expect, type Page, type Browser } from '@playwright/test';
import { STORAGE_STATE } from '../constants';

// Public booking does NOT require authentication
test.use({ storageState: { cookies: [], origins: [] } });

const SLUG = 'demo';

// ── Helpers ──────────────────────────────────────────────────────────────

/** Navigate the inline calendar to a target date and click the day. */
async function selectDateInCalendar(page: Page, targetDate: Date) {
  const calendar = page.locator('.grid-cols-7');
  await expect(calendar).toBeVisible({ timeout: 3_000 });

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

/** Get the next working day (skip Saturday and Sunday). */
function getNextWeekday(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  // Saturday → +2, Sunday → +1
  if (d.getDay() === 6) d.setDate(d.getDate() + 2);
  else if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d;
}

interface BookingData {
  firstName: string;
  phone: string;
  licensePlate: string;
  lastName?: string;
  email?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  notes?: string;
}

/**
 * Navigate through the entire booking wizard and submit.
 * Returns `true` on success, `false` if no time slots are available (test should skip).
 */
async function completeBookingWizard(
  page: Page,
  data: BookingData,
): Promise<boolean> {
  await page.goto(`/public/${SLUG}/book`);
  await page.waitForLoadState('networkidle');

  // Step 0: select branch + service
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

  // Step 1: date + time
  const targetDate = getNextWeekday();
  await selectDateInCalendar(page, targetDate);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_500);

  const timeSlots = page.locator('button').filter({
    hasText: /^\d{2}:\d{2}$/,
  });
  const slotsCount = await timeSlots.count();
  if (slotsCount === 0) return false;

  await timeSlots.first().click();
  await page.getByRole('button', { name: /continue/i }).click();

  // Step 2: fill contact form
  await page.locator('input[name="firstName"]').fill(data.firstName);
  if (data.lastName) {
    await page.locator('input[name="lastName"]').fill(data.lastName);
  }
  await page.locator('input[name="phone"]').fill(data.phone);
  if (data.email) {
    await page.locator('input[name="email"]').fill(data.email);
  }
  await page.locator('input[name="licensePlate"]').fill(data.licensePlate);
  if (data.vehicleMake) {
    await page.locator('input[name="vehicleMake"]').fill(data.vehicleMake);
  }
  if (data.vehicleModel) {
    await page.locator('input[name="vehicleModel"]').fill(data.vehicleModel);
  }
  if (data.notes) {
    await page
      .locator('textarea[name="notes"], input[name="notes"]')
      .fill(data.notes);
  }

  await page.getByRole('button', { name: /review booking/i }).click();

  // Step 3: review → confirm
  await expect(page.getByText('Review Your Booking')).toBeVisible();
  await page.getByRole('button', { name: /confirm booking/i }).click();

  return true;
}

/**
 * Open an admin browser context using stored auth state.
 */
async function openAdminContext(browser: Browser) {
  const context = await browser.newContext({ storageState: STORAGE_STATE });
  const page = await context.newPage();
  return { context, page };
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('Public Booking → Admin Verification', () => {
  // Run serially — each test submits a booking (rate limit: 3/min)
  test.describe.configure({ mode: 'serial' });

  test('complete booking shows confirmation screen', async ({ page }) => {
    test.setTimeout(60_000);

    const ts = Date.now();
    const phoneSuffix = ts.toString().slice(-7);
    const data: BookingData = {
      firstName: `E2EBook-${ts}`,
      phone: `+3805${phoneSuffix}`,
      licensePlate: `E2E${ts.toString().slice(-6)}`,
    };

    const success = await completeBookingWizard(page, data);
    if (!success) {
      test.skip(true, 'No time slots available');
      return;
    }

    // Confirmation screen
    await expect(page.getByText('Booking Confirmed!')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(data.firstName)).toBeVisible();
    await expect(page.getByText(data.licensePlate)).toBeVisible();
  });

  test('booking appears in admin orders list', async ({ page, browser }) => {
    test.setTimeout(60_000);

    const ts = Date.now();
    const plate = `ADM${ts.toString().slice(-6)}`;
    const phoneSuffix = ts.toString().slice(-7);
    const data: BookingData = {
      firstName: `E2EAdmin-${ts}`,
      phone: `+3806${phoneSuffix}`,
      licensePlate: plate,
    };

    const success = await completeBookingWizard(page, data);
    if (!success) {
      test.skip(true, 'No time slots available');
      return;
    }

    await expect(page.getByText('Booking Confirmed!')).toBeVisible({
      timeout: 10_000,
    });

    // Open admin context and check orders
    const admin = await openAdminContext(browser);
    try {
      await admin.page.goto('/orders');
      await admin.page.waitForLoadState('networkidle');

      // Find the row with our unique license plate
      const row = admin.page.locator('table tbody tr', { hasText: plate });
      await expect(row).toBeVisible({ timeout: 10_000 });

      // Status badge should show "Pending Confirmation"
      await expect(row.locator('text=Pending Confirmation')).toBeVisible();
    } finally {
      await admin.context.close();
    }
  });

  test('admin can view booking details', async ({ page, browser }) => {
    test.setTimeout(60_000);

    const ts = Date.now();
    const plate = `DTL${ts.toString().slice(-6)}`;
    const firstName = `E2EDetail-${ts}`;
    const phoneSuffix = ts.toString().slice(-7);
    const data: BookingData = {
      firstName,
      phone: `+3807${phoneSuffix}`,
      licensePlate: plate,
    };

    const success = await completeBookingWizard(page, data);
    if (!success) {
      test.skip(true, 'No time slots available');
      return;
    }

    await expect(page.getByText('Booking Confirmed!')).toBeVisible({
      timeout: 10_000,
    });

    // Open admin context
    const admin = await openAdminContext(browser);
    try {
      await admin.page.goto('/orders');
      await admin.page.waitForLoadState('networkidle');

      // Click the row with our plate
      const row = admin.page.locator('table tbody tr', { hasText: plate });
      await expect(row).toBeVisible({ timeout: 10_000 });
      await row.click();

      // Should navigate to order detail page
      await expect(admin.page).toHaveURL(/\/orders\/.+/, { timeout: 5_000 });

      // Detail page should show our data
      await expect(admin.page.getByText(firstName)).toBeVisible();
      await expect(admin.page.getByText(plate)).toBeVisible();
    } finally {
      await admin.context.close();
    }
  });
});

test.describe('Public Booking — Form Validation', () => {
  test('required fields show validation errors', async ({ page }) => {
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

    // Step 1: date + time
    const targetDate = getNextWeekday();
    await selectDateInCalendar(page, targetDate);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);

    const timeSlots = page.locator('button').filter({
      hasText: /^\d{2}:\d{2}$/,
    });
    if ((await timeSlots.count()) === 0) {
      test.skip(true, 'No time slots available');
      return;
    }
    await timeSlots.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 2: leave required fields empty, try to advance
    await expect(page.getByText('Your Information')).toBeVisible();
    await page.getByRole('button', { name: /review booking/i }).click();

    // Validation errors should appear for required fields
    const errorMessages = page.locator(
      '.text-destructive, .text-red-500, [role="alert"]',
    );
    await expect(errorMessages.first()).toBeVisible({ timeout: 3_000 });
  });

  test('invalid phone format shows validation error', async ({ page }) => {
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

    // Step 1: date + time
    const targetDate = getNextWeekday();
    await selectDateInCalendar(page, targetDate);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_500);

    const timeSlots = page.locator('button').filter({
      hasText: /^\d{2}:\d{2}$/,
    });
    if ((await timeSlots.count()) === 0) {
      test.skip(true, 'No time slots available');
      return;
    }
    await timeSlots.first().click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 2: fill firstName + licensePlate, but phone = "abc"
    await page.locator('input[name="firstName"]').fill('TestVal');
    await page.locator('input[name="phone"]').fill('abc');
    await page.locator('input[name="licensePlate"]').fill('AA1111BB');
    await page.getByRole('button', { name: /review booking/i }).click();

    // Phone validation error should appear
    const phoneError = page
      .locator('input[name="phone"]')
      .locator('..')
      .locator('.text-destructive, .text-red-500, [role="alert"]');
    // Fallback: check for any error message mentioning "phone" or "Invalid"
    const anyPhoneError = page.getByText(/invalid phone/i);
    const errorVisible =
      (await phoneError
        .first()
        .isVisible()
        .catch(() => false)) ||
      (await anyPhoneError.isVisible().catch(() => false));
    expect(errorVisible).toBe(true);
  });

  test('booking with all optional fields filled', async ({ page }) => {
    test.setTimeout(60_000);

    const ts = Date.now();
    const phoneSuffix = ts.toString().slice(-7);
    const data: BookingData = {
      firstName: `E2EFull-${ts}`,
      lastName: 'FullTest',
      phone: `+3808${phoneSuffix}`,
      email: `e2e-${ts}@test.com`,
      licensePlate: `FUL${ts.toString().slice(-6)}`,
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      notes: 'E2E test with all fields',
    };

    const success = await completeBookingWizard(page, data);
    if (!success) {
      test.skip(true, 'No time slots available');
      return;
    }

    // Confirmation screen should show all entered data
    await expect(page.getByText('Booking Confirmed!')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(data.firstName)).toBeVisible();
    await expect(page.getByText(data.licensePlate)).toBeVisible();
  });
});
