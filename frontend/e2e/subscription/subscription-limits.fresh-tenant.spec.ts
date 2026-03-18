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

test.describe('Subscription Limits (Fresh Tenant)', () => {
  test('trial banner is shown', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Fresh tenant should be on TRIAL — trial badge visible
    const trialBadge = page.getByText(/trial/i);
    await expect(trialBadge.first()).toBeVisible({ timeout: 10_000 });
  });

  test('usage shows 0 or minimal values for all resources', async ({
    page,
  }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Wait for the page to load
    await expect(page.getByText(/subscription/i).first()).toBeVisible({
      timeout: 10_000,
    });

    // Fresh tenant starts with 1 user (the owner), 0 branches, 0 work posts, 0 services
    // Check for "0 /" or "1 /" patterns in resource cards
    const bodyText = await page.locator('body').textContent();
    // At minimum, branches should be 0
    expect(bodyText).toMatch(/0\s*\/\s*\d/);
  });

  test('can create branches up to the trial limit', async ({ page }) => {
    const token = await getAccessToken(page);

    // Trial limit is 3 branches — create 3 via API
    for (let i = 0; i < 3; i++) {
      const res = await page.request.post(`${API_BASE}/branches`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: `E2E Branch ${i + 1}`,
          address: `Test Address ${i + 1}`,
          phone: `+38044${String(1000000 + i)}`,
        },
      });

      expect(res.status()).toBeLessThan(400);
    }

    // Verify on subscription page
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Should show 3/3 for branches
    await expect(page.getByText(/3\s*\/\s*3/).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test('4th branch creation exceeds limit', async ({ page }) => {
    const token = await getAccessToken(page);

    // Try creating a 4th branch (should fail if 3 already exist)
    const res = await page.request.post(`${API_BASE}/branches`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: 'E2E Branch Over Limit',
        address: 'Over Limit Address',
        phone: '+380449999999',
      },
    });

    // Should be rejected — 403 or 409 or similar
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test('create services via API until limit, verify UI shows count', async ({
    page,
  }) => {
    const token = await getAccessToken(page);

    // Create services up to trial limit (20)
    let created = 0;
    for (let i = 0; i < 20; i++) {
      const res = await page.request.post(`${API_BASE}/services`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          name: `E2E Service ${i + 1}`,
          durationMin: 15,
          price: 100 + i * 10,
        },
      });

      if (res.ok()) {
        created++;
      } else {
        break; // Hit the limit
      }
    }

    // Verify subscription page shows the count
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Services card should show N / 20
    await expect(
      page.getByText(new RegExp(`${created}\\s*/\\s*20`)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('subscription page reflects current usage', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Should display resource usage cards
    await expect(page.getByText(/users/i).first()).toBeVisible();
    await expect(page.getByText(/branches/i).first()).toBeVisible();
    await expect(page.getByText(/work posts/i).first()).toBeVisible();
    await expect(page.getByText(/services/i).first()).toBeVisible();
  });

  test('upgrade CTA is visible for trial tenant', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    // Upgrade CTA should be visible for trial users
    const upgradeCta = page.getByText(/upgrade your plan/i);
    await expect(upgradeCta.first()).toBeVisible({ timeout: 10_000 });
  });

  test('View Plans button navigates to plans page', async ({ page }) => {
    await page.goto('/subscription');
    await page.waitForLoadState('networkidle');

    const viewPlansButton = page.getByRole('button', { name: /view plans/i });
    if (await viewPlansButton.isVisible()) {
      await viewPlansButton.click();
      await expect(page).toHaveURL(/\/subscription\/plans/, {
        timeout: 10_000,
      });
    }
  });
});
