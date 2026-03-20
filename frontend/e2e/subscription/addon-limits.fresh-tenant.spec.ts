import { test, expect, type Page } from '@playwright/test';
import pg from 'pg';

const API_BASE = 'http://localhost:3003/api/v1';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/washflow_test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAccessToken(page: Page): Promise<string> {
  const res = await page.request.post(`${API_BASE}/auth/refresh`);
  if (!res.ok()) return '';
  const body = await res.json();
  return body.data?.accessToken ?? body.accessToken ?? '';
}

function extractTenantId(token: string): string {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64').toString(),
  );
  return payload.tenantId;
}

async function setSubscriptionTier(
  tenantId: string,
  tier: string,
  limits: {
    maxBranches: number;
    maxWorkPosts: number;
    maxUsers: number;
    maxServices: number;
  },
  isTrial = false,
): Promise<void> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    const status = isTrial ? 'TRIALING' : 'ACTIVE';
    await client.query(
      `UPDATE "subscriptions"
         SET "planTier" = $1::"PlanTier",
             "isTrial" = $7,
             "maxBranches" = $2,
             "maxWorkPosts" = $3,
             "maxUsers" = $4,
             "maxServices" = $5,
             "status" = $8::"SubscriptionStatus"
       WHERE "tenantId" = $6`,
      [
        tier,
        limits.maxBranches,
        limits.maxWorkPosts,
        limits.maxUsers,
        limits.maxServices,
        tenantId,
        isTrial,
        status,
      ],
    );
  } finally {
    await client.end();
  }
}

/** Unwrap TransformInterceptor envelope: { data: ... } → data */
function unwrap(body: Record<string, unknown>): Record<string, unknown> {
  return (body.data as Record<string, unknown>) ?? body;
}

// ---------------------------------------------------------------------------
// Tests — sequential within describe
// ---------------------------------------------------------------------------

test.describe('Addon → Limit Increase (Fresh Tenant)', () => {
  let token: string;
  let tenantId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      storageState: undefined,
    });
    // We'll get the token in the first test — beforeAll just ensures the
    // describe block runs sequentially.
    await context.close();
  });

  test.afterAll(async () => {
    // Reset subscription back to TRIAL so subscription-limits tests pass
    if (tenantId) {
      await setSubscriptionTier(
        tenantId,
        'TRIAL',
        { maxBranches: 3, maxWorkPosts: 10, maxUsers: 15, maxServices: 20 },
        true,
      );
    }
  });

  test('1. TRIAL rejects addon request', async ({ page }) => {
    token = await getAccessToken(page);
    expect(token).toBeTruthy();
    tenantId = extractTenantId(token);

    const res = await page.request.post(`${API_BASE}/subscription/addons`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { resource: 'services', quantity: 2 },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/trial/i);
  });

  test('2. Upgrade to STARTER via DB', async () => {
    await setSubscriptionTier(tenantId, 'STARTER', {
      maxBranches: 1,
      maxWorkPosts: 5,
      maxUsers: 5,
      maxServices: 15,
    });
  });

  test('3. Add services addon qty=2 → 200', async ({ page }) => {
    token = await getAccessToken(page);
    const res = await page.request.post(`${API_BASE}/subscription/addons`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { resource: 'services', quantity: 2 },
    });

    expect(res.status()).toBe(200);
  });

  test('4. Verify limits increased → maxServices=35', async ({ page }) => {
    token = await getAccessToken(page);
    const res = await page.request.get(`${API_BASE}/subscription/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBe(true);
    const raw = await res.json();
    const body = unwrap(raw);
    // STARTER base 15 + addon 2 * unitSize 10 = 35
    expect((body.usage as { services: { max: number } }).services.max).toBe(35);
  });

  test('5. Create one service under new limit → 200', async ({ page }) => {
    token = await getAccessToken(page);
    const res = await page.request.post(`${API_BASE}/services`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'Addon E2E Service',
        durationMin: 30,
        price: 50,
      },
    });

    expect(res.status()).toBeLessThan(400);
  });

  test('6. Remove addon → 200', async ({ page }) => {
    token = await getAccessToken(page);
    const res = await page.request.post(`${API_BASE}/subscription/addons`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { resource: 'services', quantity: 0 },
    });

    expect(res.status()).toBe(200);
  });

  test('7. Verify limits reverted → maxServices=15', async ({ page }) => {
    token = await getAccessToken(page);
    const res = await page.request.get(`${API_BASE}/subscription/usage`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.ok()).toBe(true);
    const raw = await res.json();
    const body = unwrap(raw);
    expect((body.usage as { services: { max: number } }).services.max).toBe(15);
  });
});
