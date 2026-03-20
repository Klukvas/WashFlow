import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Full end-to-end booking flow test for the customer widget.
 *
 * Prerequisites:
 * - Backend running on port 3003 (proxied through Vite on 5174)
 * - Tenant (VITE_TENANT_ID) has active branches with work posts, services, and booking enabled
 */

const API_BASE = 'http://localhost:5174/api/v1/public/widget';
const TENANT_ID =
  process.env.VITE_TENANT_ID || 'bacd28b4-bc83-4dde-ba1c-77b6f71c660c';

const apiHeaders = {
  'x-carwash-tenant-id': TENANT_ID,
  'Content-Type': 'application/json',
};

test.describe('Booking Widget — Full Flow', () => {
  test('loads the booking page with services and branch', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Step indicator should be visible
    await expect(page.getByText(/services & time/i).first()).toBeVisible();

    // At least one service checkbox should exist
    const serviceCheckbox = page.getByRole('checkbox').first();
    await expect(serviceCheckbox).toBeVisible();
  });

  test('complete booking flow end-to-end', async ({ page, request }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // ── Step 0: Select service + date/time ──

    // Get the currently selected branch from the dropdown
    const branchSelect = page.locator('select').first();
    let selectedBranchId: string;

    if (await branchSelect.isVisible()) {
      // Multiple branches — pick the first non-empty option
      const options = branchSelect.locator('option:not([disabled])');
      const firstValue = await options.first().getAttribute('value');
      expect(firstValue).toBeTruthy();
      selectedBranchId = firstValue!;
      await branchSelect.selectOption(selectedBranchId);
    } else {
      // Single branch — get it from the API
      const branchesRes = await request.get(`${API_BASE}/branches`, {
        headers: apiHeaders,
      });
      const branchesBody = await branchesRes.json();
      selectedBranchId = branchesBody.data[0].id;
    }

    // Select the first service
    const firstService = page.getByRole('checkbox').first();
    await firstService.click();
    await expect(firstService).toHaveAttribute('aria-checked', 'true');

    // Get service duration for availability check
    const servicesRes = await request.get(`${API_BASE}/services`, {
      headers: apiHeaders,
    });
    const servicesBody = await servicesRes.json();
    const serviceDuration: number = servicesBody.data[0].durationMin;
    const serviceName: string = servicesBody.data[0].name;

    // Find a date with available slots via API (using the SAME branch as UI)
    const availableSlot = await findAvailableSlot(
      request,
      selectedBranchId,
      serviceDuration,
    );
    expect(
      availableSlot,
      `No available slots found for branch ${selectedBranchId} in the next 14 days`,
    ).not.toBeNull();

    // Click the target date in the calendar
    // date-fns aria-label: "Monday, March 23, 2026"
    const targetDate = new Date(availableSlot!.date + 'T12:00:00');
    const dayNum = targetDate.getDate();
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    const month = monthNames[targetDate.getMonth()];
    const year = targetDate.getFullYear();
    const datePattern = new RegExp(`${month}\\s+${dayNum},?\\s+${year}`);

    // Date is within 14 days — at most 1 "Next month" click needed
    if ((await page.getByLabel(datePattern).count()) === 0) {
      await page.getByLabel('Next month').click();
      await page.waitForTimeout(300);
    }
    await page.getByLabel(datePattern).click();

    // Wait for slots to load
    const slotButton = page.getByRole('radio').first();
    await expect(slotButton).toBeVisible({ timeout: 15_000 });
    await slotButton.click();
    await expect(slotButton).toHaveAttribute('aria-checked', 'true');

    // Click Continue
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();

    // ── Step 1: Contact Info ──

    await expect(page.getByText(/your info/i).first()).toBeVisible();

    const timestamp = Date.now();
    const testPhone = `+38067${String(timestamp).slice(-7)}`;
    const testPlate = `E2E${String(timestamp).slice(-4)}`;

    await page.getByLabel(/first name/i).fill('E2E');
    await page
      .getByLabel(/last name/i)
      .first()
      .fill('TestUser');
    await page.getByLabel(/^phone/i).fill(testPhone);
    await page.getByLabel(/license plate/i).fill(testPlate);

    // Click Review
    await page.getByRole('button', { name: /review/i }).click();

    // ── Step 2: Review & Confirm ──

    await expect(page.getByText(/review your booking/i)).toBeVisible();

    // Verify review displays our data
    await expect(page.getByText('E2E TestUser')).toBeVisible();
    await expect(page.getByText(testPhone)).toBeVisible();
    await expect(page.getByText(testPlate)).toBeVisible();
    await expect(page.getByText(serviceName).first()).toBeVisible();

    // Confirm booking
    await page.getByRole('button', { name: /confirm booking/i }).click();

    // ── Confirmation Page ──

    await expect(page.getByText(/booking confirmed/i)).toBeVisible({
      timeout: 15_000,
    });

    // Booking number should be visible
    const bookingNumber = page.getByText(/booking #/i);
    await expect(bookingNumber).toBeVisible();
    const bookingText = await bookingNumber.textContent();
    expect(bookingText).toMatch(/#[A-Z0-9]+/i);

    // Duration should NOT show NaN
    const body = await page.textContent('body');
    expect(body).not.toContain('NaN');

    // Service name visible in confirmation
    await expect(page.getByText(serviceName).first()).toBeVisible();

    // Next steps info visible
    await expect(page.getByText(/what's next/i)).toBeVisible();

    // Action buttons visible
    await expect(page.getByText(/google calendar/i)).toBeVisible();
    await expect(page.getByText(/print/i)).toBeVisible();
  });
});

// ── Helpers ──

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

async function findAvailableSlot(
  request: APIRequestContext,
  branchId: string,
  durationMinutes: number,
): Promise<{ date: string; slot: TimeSlot } | null> {
  const today = new Date();

  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];

    const res = await request.get(`${API_BASE}/availability`, {
      headers: apiHeaders,
      params: {
        branchId,
        date: dateStr,
        durationMinutes: String(durationMinutes),
      },
    });

    if (!res.ok()) continue;

    const responseBody = await res.json();
    const slots: TimeSlot[] = responseBody.data;
    const available = slots.find((s) => s.available);

    if (available) {
      return { date: dateStr, slot: available };
    }
  }

  return null;
}
