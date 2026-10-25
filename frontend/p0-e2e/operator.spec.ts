import { test, expect, type Page, type Route } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test.afterEach(async ({ page }, info) => {
  if (info.status !== info.expectedStatus) {
    process.stderr.write(
      `UI BODY: ${await page.locator('body').innerText()}\n`,
    );
    await page.screenshot({
      path: 'node_modules/p0-failure.png',
      fullPage: true,
    });
  }
});

const ids = {
  branch: '11111111-1111-4111-8111-111111111111',
  branch2: '22222222-2222-4222-8222-222222222222',
  client: '33333333-3333-4333-8333-333333333333',
  vehicle: '44444444-4444-4444-8444-444444444444',
  service: '55555555-5555-4555-8555-555555555555',
  service2: '66666666-6666-4666-8666-666666666666',
  post: '77777777-7777-4777-8777-777777777777',
  worker: '88888888-8888-4888-8888-888888888888',
  order: '99999999-9999-4999-8999-999999999999',
};
const now = '2026-10-25T08:00:00Z';
const start = '2026-10-25T10:00:00Z';
const branch = {
  id: ids.branch,
  name: 'Central wash',
  timezone: 'Europe/Kyiv',
  isActive: true,
  deletedAt: null,
};
const client = {
  id: ids.client,
  firstName: 'Olena',
  lastName: 'Test',
  phone: '+380000000001',
  email: null,
  deletedAt: null,
};
const vehicle = {
  id: ids.vehicle,
  clientId: ids.client,
  licensePlate: 'TEST 1234',
  make: 'Toyota',
  model: 'Corolla',
  client,
  deletedAt: null,
};
const services = [
  {
    id: ids.service,
    name: 'Body wash',
    durationMin: 30,
    price: '100.10',
    isActive: true,
  },
  {
    id: ids.service2,
    name: 'Interior clean',
    durationMin: 45,
    price: '50.20',
    isActive: true,
  },
];
const post = { id: ids.post, name: 'Post 1', branchId: ids.branch };
const baseOrder = {
  id: ids.order,
  branchId: ids.branch,
  clientId: ids.client,
  vehicleId: ids.vehicle,
  workPostId: ids.post,
  assignedEmployeeId: ids.worker,
  branch,
  client,
  vehicle,
  workPost: post,
  scheduledStart: start,
  scheduledEnd: '2026-10-25T10:30:00Z',
  totalPrice: '100.10',
  status: 'BOOKED',
  source: 'INTERNAL',
  updatedAt: now,
  deletedAt: null,
  services: [
    { id: 'line1', price: '100.10', quantity: 1, service: services[0] },
  ],
};
const permissions = [
  'orders.read',
  'orders.create',
  'orders.update',
  'clients.read',
  'clients.create',
  'vehicles.read',
  'vehicles.create',
  'services.read',
  'branches.read',
  'work-posts.read',
  'workforce.read',
  'payments.read',
  'payments.create',
  'analytics.view',
  'tenants.read',
];

type FixtureOptions = {
  theme?: 'light' | 'dark';
  language?: 'en' | 'uk';
  analytics?: boolean;
  paymentCreate?: boolean;
  status?: string;
  multipleBranches?: boolean;
  delayAvailability?: boolean;
};
async function fixture(page: Page, options: FixtureOptions = {}) {
  page.on('pageerror', (error) =>
    process.stderr.write(`BROWSER ERROR: ${error.message}\n`),
  );
  page.on('console', (message) => {
    if (message.type() === 'error')
      process.stderr.write(`BROWSER CONSOLE: ${message.text()}\n`);
  });
  await mkdir('test-results/p0-evidence', { recursive: true });
  const user = {
    id: 'u1',
    tenantId: 't1',
    email: 'operator@example.test',
    firstName: 'Test',
    lastName: 'Operator',
    branchId: options.multipleBranches ? null : ids.branch,
    isSuperAdmin: false,
  };
  const allowed = permissions.filter(
    (p) =>
      (options.analytics !== false || p !== 'analytics.view') &&
      (options.paymentCreate !== false || p !== 'payments.create'),
  );
  const token = `e30.${Buffer.from(JSON.stringify({ permissions: allowed, type: 'access' })).toString('base64')}.synthetic`;
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(
    ({ user, theme, language }) => {
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('theme', theme);
      localStorage.setItem('i18nextLng', language);
    },
    {
      user,
      theme: options.theme ?? 'light',
      language: options.language ?? 'en',
    },
  );
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const requests: URL[] = [];
  let paymentRecorded = false;
  let scheduledStart = start;
  const envelope = (data: unknown) => ({ data, meta: { timestamp: now } });
  const paginated = (data: unknown[]) => ({
    data,
    meta: {
      timestamp: now,
      total: data.length,
      page: 1,
      limit: 100,
      totalPages: 1,
    },
  });
  await page.route('**/api/v1/**', async (route: Route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const path = url.pathname.replace('/api/v1', '');
    const method = route.request().method();
    const reply = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    if (path === '/auth/refresh')
      return reply(envelope({ accessToken: token, user }));
    if (path === '/subscription/status')
      return reply(envelope({ isTrial: false, paymentsEnabled: false }));
    if (path === '/subscription/usage')
      return reply(envelope({ subscription: null, usage: {} }));
    if (path === '/branches')
      return reply(
        paginated(
          options.multipleBranches
            ? [branch, { ...branch, id: ids.branch2, name: 'West wash' }]
            : [branch],
        ),
      );
    if (path === '/services') return reply(paginated(services));
    if (path === '/clients') {
      if (method === 'POST') {
        writes.push({ path, body: route.request().postDataJSON() });
        return reply(
          envelope({
            ...client,
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            ...route.request().postDataJSON(),
          }),
        );
      }
      return reply(paginated([client]));
    }
    if (path === '/vehicles') {
      if (method === 'POST') {
        writes.push({ path, body: route.request().postDataJSON() });
        return reply(
          envelope({ ...vehicle, ...route.request().postDataJSON() }),
        );
      }
      return reply(
        paginated(url.searchParams.has('search') ? [vehicle] : [vehicle]),
      );
    }
    if (path === '/work-posts') return reply(paginated([post]));
    if (path === '/workforce/profiles')
      return reply(
        paginated([
          {
            id: ids.worker,
            userId: 'worker-user',
            isWorker: true,
            active: true,
            user: { firstName: 'Dmytro', lastName: 'Worker' },
          },
        ]),
      );
    if (path.endsWith('/booking-settings'))
      return reply(envelope({ workingDays: [0, 1, 2, 3, 4, 5, 6] }));
    if (path === '/orders/availability') {
      if (
        options.delayAvailability &&
        url.searchParams.get('durationMinutes') === '75'
      )
        await new Promise((resolve) => setTimeout(resolve, 600));
      const longer = url.searchParams.get('durationMinutes') === '75';
      return reply(
        envelope([
          {
            start: longer ? '2026-10-25T12:00:00Z' : start,
            end: '2026-10-25T12:30:00Z',
            workPostId: ids.post,
            workPostName: 'Post 1',
            available: true,
          },
          {
            start: '2026-10-25T13:00:00Z',
            end: '2026-10-25T13:30:00Z',
            workPostId: ids.post,
            workPostName: 'Post 1',
            available: false,
          },
        ]),
      );
    }
    if (path === '/orders/schedule')
      return reply(
        envelope({
          branchId: ids.branch,
          date: '2026-10-25',
          timezone: 'Europe/Kyiv',
          now,
          range: { start: '2026-10-24T21:00:00Z', end: '2026-10-25T22:00:00Z' },
          orders: Array.from({ length: 25 }, (_, i) => ({
            id: i ? `o${i}` : ids.order,
            status: i === 0 ? 'IN_PROGRESS' : 'BOOKED',
            vehicle: { licensePlate: i ? `CAR ${i}` : 'TEST 1234' },
            workPost: post,
            scheduledStart: '2026-10-25T06:00:00Z',
            scheduledEnd: '2026-10-25T07:00:00Z',
            services: [{ name: 'Body wash' }],
            assignedEmployee: { id: ids.worker, name: 'Dmytro Worker' },
            isOverdue: i === 0,
          })),
        }),
      );
    if (path === '/analytics/day-summary')
      return reply(
        envelope({
          branchId: ids.branch,
          date: '2026-10-25',
          timezone: 'Europe/Kyiv',
          range: { start: now, end: start },
          sales: {
            orderCount: 25,
            completedCount: 2,
            scheduledTotal: '2500.00',
            completedTotal: '200.00',
            byStatus: [{ status: 'BOOKED', count: 23, total: '2300.00' }],
          },
          receipts: {
            count: 3,
            total: '75.30',
            byMethod: [
              { method: 'CASH', count: 2, total: '50.10' },
              { method: 'CARD', count: 1, total: '25.20' },
            ],
          },
        }),
      );
    if (path === `/orders/${ids.order}/reschedule`) {
      const body = route.request().postDataJSON();
      writes.push({ path, body });
      scheduledStart = body.scheduledStart;
      return reply(envelope({ ...baseOrder, scheduledStart }));
    }
    if (path === `/orders/${ids.order}/payments`) {
      if (method === 'POST') {
        writes.push({ path, body: route.request().postDataJSON() });
        paymentRecorded = true;
        return reply(
          envelope({
            id: 'new-payment',
            amount: '20.00',
            method: 'CASH',
            status: 'PAID',
            createdAt: now,
          }),
        );
      }
      return reply(
        envelope([
          {
            id: 'paid',
            amount: '30.10',
            method: 'CASH',
            status: 'PAID',
            createdAt: now,
          },
          {
            id: 'pending',
            amount: '10.00',
            method: 'CARD',
            status: 'PENDING',
            createdAt: now,
          },
          ...(paymentRecorded
            ? [
                {
                  id: 'new-payment',
                  amount: '20.00',
                  method: 'CASH',
                  status: 'PAID',
                  createdAt: now,
                },
              ]
            : []),
        ]),
      );
    }
    if (path === `/orders/${ids.order}`)
      return reply(
        envelope({
          ...baseOrder,
          scheduledStart,
          status: options.status ?? 'BOOKED',
        }),
      );
    if (path === '/orders') {
      if (method === 'POST') {
        writes.push({ path, body: route.request().postDataJSON() });
        return reply(envelope(baseOrder));
      }
      return reply(paginated([baseOrder]));
    }
    return reply(envelope(null));
  });
  return { writes, requests };
}
async function selectIntake(page: Page) {
  await page.getByLabel('Client phone or vehicle plate').fill('000001');
  await page.getByRole('button', { name: /Olena Test.*380000000001/ }).click();
  await page.getByRole('button', { name: /TEST 1234 Toyota Corolla/ }).click();
  await page.getByRole('checkbox', { name: /Body wash/ }).check();
  await expect(
    page.getByRole('button', { name: 'Confirm Booking' }),
  ).toBeEnabled();
}

test('quick intake default, wizard entry, and single guarded create', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.goto('/orders/create');
  await expect(
    page.getByRole('heading', { name: 'Quick order' }),
  ).toBeVisible();
  await expect(page.getByLabel('Branch', { exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Confirm Booking' }),
  ).toBeDisabled();
  await selectIntake(page);
  await page.screenshot({
    path: 'test-results/p0-evidence/quick-filled.png',
    fullPage: true,
  });
  await expect(page.getByLabel('Available start and work post')).toHaveValue(
    `${start}|${ids.post}`,
  );
  await page.getByRole('button', { name: 'Confirm Booking' }).dblclick();
  await expect(page).toHaveURL(`/orders/${ids.order}`);
  expect(api.writes.filter((w) => w.path === '/orders')).toHaveLength(1);
  expect(api.writes[0].body).toEqual({
    branchId: ids.branch,
    clientId: ids.client,
    vehicleId: ids.vehicle,
    serviceIds: [ids.service],
    scheduledStart: start,
    workPostId: ids.post,
  });
  await page.goto('/orders/create?mode=wizard');
  await expect(page.getByText('How would you like to start?')).toBeVisible();
});

test('duration and branch context resets never submit stale capacity', async ({
  page,
}) => {
  const api = await fixture(page, {
    multipleBranches: true,
    delayAvailability: true,
  });
  await page.goto(
    `/orders/create?branchId=${ids.branch}&date=2026-10-25&time=${encodeURIComponent(start)}&workPostId=${ids.post}`,
  );
  await selectIntake(page);
  await page.getByRole('checkbox', { name: /Interior clean/ }).check();
  await expect(
    page.getByRole('button', { name: 'Confirm Booking' }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      'The selected slot is unavailable for this duration. Choose a new available slot.',
    ),
  ).toBeVisible();
  await page
    .getByLabel('Available start and work post')
    .selectOption(`2026-10-25T12:00:00Z|${ids.post}`);
  await expect(
    page.getByRole('button', { name: 'Confirm Booking' }),
  ).toBeEnabled();
  await page.getByLabel('Branch', { exact: true }).selectOption(ids.branch2);
  await expect(
    page.getByRole('button', { name: 'Confirm Booking' }),
  ).toBeDisabled();
  expect(api.writes).toHaveLength(0);
});

test('schedule shows all occupied cards, local now, day sales vs receipts and navigates details', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.goto('/orders');
  await page.getByRole('tab', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('CAR 24', { exact: true })).toBeVisible();
  await expect(page.getByTestId('schedule-now')).toContainText('10:00');
  await expect(
    page.getByText(/In progress beyond scheduled end/),
  ).toBeVisible();
  await expect(
    page.getByText('Scheduled sales', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Paid receipts', { exact: true })).toBeVisible();
  await expect(page.getByText('2500.00 ₴', { exact: true })).toBeVisible();
  await expect(page.getByText('75.30 ₴', { exact: true })).toBeVisible();
  await page.screenshot({
    path: 'test-results/p0-evidence/schedule-cards.png',
    fullPage: true,
  });
  await page
    .getByText('Paid receipts', { exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: 'test-results/p0-evidence/day-summary.png',
    fullPage: true,
  });
  await page.getByRole('button').filter({ hasText: 'TEST 1234' }).click();
  await expect(page).toHaveURL(`/orders/${ids.order}`);
  expect(api.writes).toHaveLength(0);
});

test('reschedule preserves omitted resources and availability excludes the order', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.goto(`/orders/${ids.order}`);
  await page.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({
    path: 'test-results/p0-evidence/reschedule.png',
    fullPage: true,
  });
  await page
    .getByLabel('Select Time Slot', { exact: true })
    .selectOption(start);
  await page.getByRole('button', { name: 'Save schedule' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const write = api.writes.find((w) => w.path.endsWith('/reschedule'));
  expect(write?.body).toEqual({ scheduledStart: start });
  expect(
    api.requests.some(
      (url) =>
        url.pathname.endsWith('/availability') &&
        url.searchParams.get('excludeOrderId') === ids.order &&
        url.searchParams.get('durationMinutes') === '30' &&
        url.searchParams.get('assignedEmployeeId') === ids.worker,
    ),
  ).toBeTruthy();
});

test('partial payment distinguishes paid/remaining/cap, prevents overpay and records method', async ({
  page,
}) => {
  const api = await fixture(page);
  await page.goto(`/orders/${ids.order}`);
  await expect(page.getByText('Partially paid', { exact: true })).toBeVisible();
  await expect(page.getByText('70.00 ₴', { exact: true })).toBeVisible();
  await expect(page.getByText(/Available to record: 60.00/)).toBeVisible();
  await page.screenshot({
    path: 'test-results/p0-evidence/order-payments.png',
    fullPage: true,
  });
  await page.getByLabel('Amount', { exact: true }).fill('60.01');
  await expect(
    page.getByRole('button', { name: 'Record payment' }),
  ).toBeDisabled();
  await page.getByLabel('Amount', { exact: true }).fill('20.00');
  await page.getByRole('button', { name: 'Record payment' }).click();
  await expect(page.getByText('50.00 ₴', { exact: true })).toBeVisible();
  expect(api.writes[0].body).toEqual({ amount: 20, method: 'CASH' });
  await expect(
    page.getByText(/Record payment before completing/),
  ).toBeVisible();
});

test('closed payments, independent permissions and UK mobile/dark/light visual evidence', async ({
  page,
}) => {
  const api = await fixture(page, {
    status: 'COMPLETED',
    analytics: false,
    paymentCreate: false,
  });
  await page.goto(`/orders/${ids.order}`);
  await expect(
    page.getByText('Payment history', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Record payment' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Reschedule', exact: true }),
  ).toHaveCount(0);
  await page.goto('/orders');
  await page.getByRole('tab', { name: 'Schedule', exact: true }).click();
  await expect(page.getByText('CAR 24', { exact: true })).toBeVisible();
  await expect(page.getByText('Day summary', { exact: false })).toHaveCount(0);
  expect(
    api.requests.some((url) => url.pathname.endsWith('/day-summary')),
  ).toBeFalsy();
  expect(api.writes).toHaveLength(0);
});

for (const theme of ['light', 'dark'] as const) {
  test(`visual ${theme} desktop + mobile preserves shell and theme`, async ({
    page,
  }) => {
    await fixture(page, { theme, language: theme === 'dark' ? 'uk' : 'en' });
    await mkdir('test-results/p0-evidence', { recursive: true });
    await page.goto('/orders/create');
    await expect(
      page.getByRole('heading', {
        name: theme === 'dark' ? 'Швидке замовлення' : 'Quick order',
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/p0-evidence/quick-${theme}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.runFor(200);
    await expect(page.locator('aside')).toHaveCount(0);
    await page.screenshot({
      path: `test-results/p0-evidence/quick-${theme}-mobile.png`,
      fullPage: true,
    });
    await page
      .getByRole('button', {
        name: theme === 'dark' ? 'Підтвердити бронювання' : 'Confirm Booking',
      })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  });
}
