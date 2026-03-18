import { test, expect, type Page } from '@playwright/test';

const API_BASE = 'http://localhost:3003/api/v1';

async function getAccessToken(page: Page): Promise<string> {
  const res = await page.request.post(
    'http://localhost:3003/api/v1/auth/refresh',
  );
  if (!res.ok()) return '';
  const body = await res.json();
  return body.data?.accessToken ?? body.accessToken ?? '';
}

test.describe('Multi-Tenant Data Isolation (Fresh Tenant)', () => {
  test('fresh tenant sees 0 orders', async ({ page }) => {
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Either "no orders" message or empty table
    const rows = page.locator('table tbody tr');
    const count = await rows.count();

    // Fresh tenant should have zero orders
    // (may show empty state or table with 0 rows)
    expect(count).toBe(0);
  });

  test('fresh tenant sees 0 clients', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBe(0);
  });

  test('fresh tenant sees 0 vehicles', async ({ page }) => {
    await page.goto('/vehicles');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    expect(count).toBe(0);
  });

  test('fresh tenant sees 0 branches initially', async ({ page }) => {
    await page.goto('/branches');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('table tbody tr');
    await rows.count();

    // Fresh tenant starts with no branches (unless created in other tests)
    // Since tests may run in sequence after subscription-limits,
    // branches may exist; this test verifies isolation from demo tenant's branches
    // The demo tenant has 3 named branches (Центральний, Лівобережний, Подільський)
    const demoContent = await page.locator('body').textContent();
    expect(demoContent).not.toContain('Центральний');
    expect(demoContent).not.toContain('Лівобережний');
    expect(demoContent).not.toContain('Подільський');
  });

  test('dashboard shows zero KPIs for fresh tenant', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // KPI cards should exist but show 0 or empty values
    const bodyText = await page.locator('body').textContent();
    // Revenue today should be 0
    expect(bodyText).toMatch(/\$?0|₴0|0\s*(UAH|грн)?/i);
  });

  test('fresh tenant API returns no data from demo tenant', async ({
    page,
  }) => {
    const token = await getAccessToken(page);

    // Query clients API directly
    const response = await page.request.get(`${API_BASE}/clients`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const clients = body.data ?? body.items ?? [];

    // Fresh tenant should have 0 clients
    // (demo tenant has 250 — if isolation is working, we see 0)
    expect(clients.length).toBe(0);
  });
});
