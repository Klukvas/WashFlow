import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
const tenant = '22222222-2222-4222-8222-222222222222',
  a = '11111111-1111-4111-8111-111111111111',
  b = '33333333-3333-4333-8333-333333333333',
  record = '44444444-4444-4444-8444-444444444444';
const branch = (id = a, name = 'Central wash') => ({
  id,
  tenantId: tenant,
  name,
  timezone: 'Europe/Kyiv',
  isActive: true,
  deletedAt: null,
  address: '',
  phone: '',
});
const settings = (id = a) => ({
  id: record,
  tenantId: tenant,
  branchId: id,
  workingHoursStart: '08:00',
  workingHoursEnd: '20:00',
  slotDurationMinutes: 30,
  bufferTimeMinutes: 10,
  maxAdvanceBookingDays: 30,
  allowOnlineBooking: false,
  workingDays: [1, 2, 3, 4, 5],
});
const post = (id = a) => ({
  id: record,
  tenantId: tenant,
  branchId: id,
  name: 'Bay 1',
  isActive: true,
  deletedAt: null,
});
const service = {
  id: record,
  tenantId: tenant,
  name: 'Body wash',
  durationMin: 30,
  price: '0.00',
  isActive: true,
  deletedAt: null,
};
const permissions = [
  'branches.read',
  'branches.create',
  'branches.update',
  'work-posts.read',
  'work-posts.create',
  'services.read',
  'services.create',
  'orders.create',
  'orders.read',
  'clients.read',
  'vehicles.read',
  'scheduling.read',
];
type Options = {
  fresh?: boolean;
  lang?: 'en' | 'uk';
  theme?: 'light' | 'dark';
  missing?: string[];
  scoped?: string;
  legacy?: boolean;
  malformed?: boolean;
  page2?: boolean;
  slow?: boolean;
  analytics?: boolean;
  postsError?: boolean;
};
async function fixture(page: Page, o: Options = {}) {
  const requests: string[] = [],
    writes: { path: string; data: Record<string, unknown> }[] = [];
  const resources = {
    branches: o.fresh ? [] : [branch(), branch(b, 'West wash')],
    settings:
      o.fresh || o.legacy
        ? (null as ReturnType<typeof settings> | null)
        : settings(),
    posts: o.fresh ? [] : [post()],
    services: o.fresh ? [] : [service],
    postsError: !!o.postsError,
  };
  if (o.page2)
    resources.branches = [
      branch(),
      ...Array.from({ length: 99 }, (_, i) =>
        branch(
          `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`,
          `Wash ${i}`,
        ),
      ),
      branch(b, 'Page two wash'),
    ];
  const user = {
    id: record,
    tenantId: tenant,
    branchId: o.scoped ?? null,
    email: 'setup@example.test',
    firstName: 'Setup',
    lastName: 'Tester',
    isSuperAdmin: false,
  };
  const allowed = permissions
    .filter((p) => !o.missing?.includes(p))
    .concat(o.analytics ? ['analytics.view'] : []);
  const token = `e30.${Buffer.from(JSON.stringify({ permissions: allowed, type: 'access' })).toString('base64')}.synthetic`;
  await page.addInitScript(
    ({ user, lang, theme }) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('i18nextLng', lang);
      localStorage.setItem('theme', theme);
    },
    { user, lang: o.lang ?? 'en', theme: o.theme ?? 'light' },
  );
  await page.route('**/*', (route) =>
    new URL(route.request().url()).hostname === '127.0.0.1'
      ? route.continue()
      : route.abort(),
  );
  await page.routeWebSocket('**/*', (socket) => socket.close());
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.replace('/api/v1', ''),
      method = route.request().method();
    requests.push(`${method} ${path}${url.search}`);
    const reply = (data: unknown, status = 200, meta = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({
          data,
          meta: { timestamp: '2026-10-26T08:00:00Z', ...meta },
        }),
      });
    if (path === '/auth/refresh') return reply({ user, accessToken: token });
    if (path === '/subscription/status')
      return reply({ isTrial: false, paymentsEnabled: false });
    if (path === '/usage' || path === '/subscription/usage')
      return reply({ subscription: null, usage: {} });
    if (method !== 'GET')
      writes.push({ path, data: route.request().postDataJSON() });
    if (path === '/branches') {
      if (method === 'POST') {
        const created = {
          ...branch(resources.branches.length ? record : a),
          ...route.request().postDataJSON(),
        };
        if (o.slow) await new Promise((r) => setTimeout(r, 700));
        resources.branches = [...resources.branches, created];
        return reply(created);
      }
      const pn = Number(url.searchParams.get('page') ?? 1),
        all = resources.branches;
      return reply(all.slice((pn - 1) * 100, pn * 100), 200, {
        total: all.length,
        page: pn,
        limit: 100,
        totalPages: Math.ceil(all.length / 100),
      });
    }
    if (path.endsWith('/booking-settings')) {
      const id = path.split('/')[2];
      if (o.slow && id === a) await new Promise((r) => setTimeout(r, 700));
      if (method === 'PATCH') {
        resources.settings = {
          ...settings(id),
          ...route.request().postDataJSON(),
        };
        return reply(resources.settings);
      }
      if (o.malformed) return reply({ workingHoursStart: 'bad' });
      if (!resources.settings && o.legacy)
        return reply({
          workStartTime: '09:00',
          workEndTime: '18:00',
          slotDuration: 60,
          workingDays: [1, 2, 3, 4, 5],
          maxAdvanceBookingDays: 30,
          requireConfirmation: false,
        });
      return reply(
        resources.settings ? { ...resources.settings, branchId: id } : null,
      );
    }
    if (path === '/work-posts') {
      if (method === 'POST') {
        resources.posts = [{ ...post(), ...route.request().postDataJSON() }];
        return reply(resources.posts[0]);
      }
      if (resources.postsError)
        return reply({ message: 'Synthetic offline' }, 503);
      return reply(
        resources.posts.map((p) => ({
          ...p,
          branchId: url.searchParams.get('branchId') ?? p.branchId,
        })),
      );
    }
    if (path === '/services') {
      if (method === 'POST') {
        resources.services = [
          { ...service, ...route.request().postDataJSON() },
        ];
        return reply(resources.services[0]);
      }
      return reply(resources.services);
    }
    if (path.startsWith('/analytics/')) return reply({}, 503);
    if (path === '/clients' || path === '/vehicles')
      return reply([], 200, { total: 0, page: 1, limit: 10, totalPages: 0 });
    return reply(null, 404);
  });
  return { requests, writes, resources };
}
async function screenshot(page: Page, name: string) {
  await mkdir('test-results/p1-setup', { recursive: true });
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await page.screenshot({
    path: `test-results/p1-setup/${name}.png`,
    fullPage: (page.viewportSize()?.width ?? 1440) >= 1024,
  });
}
test('fresh 0→4, reload and selected quick-order handoff', async ({ page }) => {
  const f = await fixture(page, { fresh: true });
  await page.goto('/setup');
  await expect(page.getByText(/0\/4/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Create branch', exact: true })
    .click();
  await page.getByLabel('Name *').fill('Central wash');
  await page.getByLabel('Timezone *').selectOption('Europe/Kiev');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('1/4')).toBeVisible();
  await page.getByRole('button', { name: 'Set working hours' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('2/4')).toBeVisible();
  await page
    .getByRole('button', { name: 'Create work post', exact: true })
    .click();
  await page.getByLabel('Name', { exact: true }).fill('Bay 1');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('3/4')).toBeVisible();
  await page
    .getByRole('button', { name: 'Create service', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill('Body wash');
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('4/4')).toBeVisible();
  await page.reload();
  await expect(page.getByText('4/4')).toBeVisible();
  await page.getByRole('link', { name: 'Open quick order' }).click();
  await expect(page).toHaveURL(new RegExp(`/orders/create\\?branchId=${a}`));
  await expect(page.getByLabel('Branch', { exact: true })).toHaveValue(a);
  expect(f.writes.map((w) => w.path)).toEqual([
    '/branches',
    `/branches/${a}/booking-settings`,
    '/work-posts',
    '/services',
  ]);
  expect(f.writes[0].data.timezone).toBe('Europe/Kiev');
});
test('voluntary dashboard entry, zero analytics without capability', async ({
  page,
}) => {
  const f = await fixture(page);
  await page.goto('/dashboard');
  await expect(
    page.getByRole('link', { name: /Set up your wash/ }),
  ).toBeVisible();
  expect(f.requests.filter((r) => r.includes('/analytics/'))).toEqual([]);
  await expect(page).toHaveURL(/dashboard$/);
  await page.getByRole('link', { name: /Set up your wash/ }).click();
  await expect(page.getByLabel('Branch', { exact: true })).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText('Choose a branch');
  await expect(page.getByText(/0\/4/)).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open quick order' }),
  ).toHaveCount(0);
  expect(
    f.requests.some(
      (request) =>
        request.includes('/booking-settings') ||
        request.includes('/work-posts') ||
        request.includes('/services'),
    ),
  ).toBe(false);
  await page.getByLabel('Branch', { exact: true }).selectOption(a);
  await expect(page.getByText('Basic setup complete')).toBeVisible();
  await screenshot(page, 'desktop-en-light');
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await screenshot(page, 'desktop-en-dark');
});
test('legacy fallback is unsaved and defaults can be saved', async ({
  page,
}) => {
  await fixture(page, { legacy: true });
  await page.goto(`/setup?branchId=${a}`);
  await expect(page.getByText('3/4')).toBeVisible();
  await page.getByRole('button', { name: 'Set working hours' }).click();
  await expect(
    page.getByRole('button', { name: 'Save', exact: true }),
  ).toBeEnabled();
});
test('malformed settings exposes retry and never ready', async ({ page }) => {
  await fixture(page, { malformed: true });
  await page.goto(`/setup?branchId=${a}`);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open quick order' }),
  ).toHaveCount(0);
});
test('forged scoped URL never queries branches', async ({ page }) => {
  const f = await fixture(page, { scoped: a });
  await page.goto(`/setup?branchId=${b}`);
  await expect(
    page.getByText(/unavailable in your current access scope/),
  ).toBeVisible();
  expect(f.requests.filter((r) => r.includes('/branches'))).toEqual([]);
});
test('page-two branch reaches quick order', async ({ page }) => {
  const f = await fixture(page, { page2: true });
  await page.goto(`/setup?branchId=${b}`);
  await expect(page.getByText('4/4')).toBeVisible();
  await page.getByRole('link', { name: 'Open quick order' }).click();
  await expect(page.getByLabel('Branch', { exact: true })).toHaveValue(b);
  expect(f.requests.some((r) => r.includes('page=2'))).toBe(true);
});
test('missing reads prevent inaccessible requests', async ({ page }) => {
  const f = await fixture(page, {
    missing: ['work-posts.read', 'services.read'],
  });
  await page.goto(`/setup?branchId=${a}`);
  await expect(
    page.getByText(/administrator for access to view work posts/),
  ).toBeVisible();
  await expect(
    page.getByText(/administrator for access to view services/),
  ).toBeVisible();
  expect(
    f.requests.some(
      (r) => r.includes('/work-posts') || r.includes('/services'),
    ),
  ).toBe(false);
});
test('missing writes explain access and preserve existing-customer order entry', async ({
  page,
}) => {
  await fixture(page, {
    missing: ['branches.update', 'work-posts.create', 'services.create'],
  });
  await page.goto(`/setup?branchId=${a}`);
  await expect(
    page.getByText(/administrator for access to create work posts/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Create work post', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Open quick order' }),
  ).toBeVisible();
});
test('resource retry resumes saved progress', async ({ page }) => {
  const f = await fixture(page, { postsError: true });
  await page.goto(`/setup?branchId=${a}`);
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  f.resources.postsError = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('4/4')).toBeVisible();
});
test('late A response cannot overwrite selected B', async ({ page }) => {
  await fixture(page, { slow: true });
  await page.goto(`/setup?branchId=${a}`);
  await page.getByLabel('Branch', { exact: true }).selectOption(b);
  await expect(page.getByText('4/4')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Open quick order' }),
  ).toHaveAttribute('href', `/orders/create?branchId=${b}`);
  await page.getByLabel('Branch', { exact: true }).selectOption(a);
  await page.getByLabel('Branch', { exact: true }).selectOption(b);
  await expect(
    page.getByRole('link', { name: 'Open quick order' }),
  ).toHaveAttribute('href', `/orders/create?branchId=${b}`);
});
test('mobile Ukrainian dark forms remain accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await fixture(page, { lang: 'uk', theme: 'dark' });
  await page.goto(`/setup?branchId=${a}`);
  await expect(
    page.getByRole('heading', { name: 'Налаштування автомийки', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('4/4')).toBeVisible();
  await page.getByRole('button', { name: 'Налаштувати години' }).click();
  await expect(
    page.getByRole('button', { name: 'Пн', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    document.querySelector('main')?.scrollTo(0, 0);
  });
  await screenshot(page, 'mobile-uk-dark');
  await page.locator('#workingHoursStart').scrollIntoViewIfNeeded();
  await screenshot(page, 'mobile-uk-dark-hours');
  await page
    .locator('main')
    .evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await screenshot(page, 'mobile-uk-dark-bottom');
  await page.getByRole('button', { name: 'Switch to system theme' }).click();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.locator('main').evaluate((element) => element.scrollTo(0, 0));
  await screenshot(page, 'mobile-uk-light');
});
test('analytics failure leaves dashboard entry visible', async ({ page }) => {
  await fixture(page, { analytics: true });
  await page.goto('/dashboard');
  await expect(
    page.getByRole('link', { name: /Set up your wash/ }),
  ).toBeVisible();
});

test('late branch creation cannot replace selected branch URL', async ({
  page,
}) => {
  const f = await fixture(page, { slow: true });
  await page.goto(`/setup?branchId=${a}`);
  await page
    .getByRole('button', { name: 'Create branch', exact: true })
    .click();
  await page.getByLabel('Name *').fill('New wash');
  await page.getByLabel('Timezone *').selectOption('Europe/Kiev');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByLabel('Branch', { exact: true }).selectOption(b);
  await expect(page).toHaveURL(new RegExp(`branchId=${b}`));
  await expect.poll(() => f.resources.branches.length).toBe(3);
  await expect(
    page.getByRole('link', { name: 'Open quick order' }),
  ).toHaveAttribute('href', `/orders/create?branchId=${b}`);
  await expect(page).toHaveURL(new RegExp(`branchId=${b}`));
});
