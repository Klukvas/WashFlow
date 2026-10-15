import { test, expect, type Page } from '@playwright/test';

const widget = false;
const branchA = '11111111-1111-4111-8111-111111111111';
const branchB = '22222222-2222-4222-8222-222222222222';
const serviceA = '33333333-3333-4333-8333-333333333333';
const serviceB = '44444444-4444-4444-8444-444444444444';

type ValidationGate = {
  __qaHoldValidation?: boolean;
  __qaValidationStarted?: boolean;
  __qaResumeValidation?: () => void;
};

type Scenario = {
  delayedValidation?: boolean;
  bookPaths?: string[];
  delayDate?: string;
  unavailable?: boolean;
  duration?: number;
  fail?: boolean;
  books: Record<string, unknown>[];
  release?: () => void;
};

async function openBooking(page: Page, scenario: Scenario) {
  await page.clock.install({ time: new Date('2030-04-10T09:00:00Z') });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['localhost', '127.0.0.1'].includes(url.hostname))
      return route.abort();
    if (
      scenario.delayedValidation &&
      url.pathname.endsWith('/PublicBookingPage.tsx')
    ) {
      const response = await route.fetch();
      const original = await response.text();
      const marker = 'resolver: zodResolver(bookingSchema),';
      expect(original).toContain(marker);
      const body = original.replace(
        marker,
        `resolver: async (...args) => {
        if (window.__qaHoldValidation) {
          window.__qaValidationStarted = true;
          await new Promise(resolve => { window.__qaResumeValidation = resolve; });
        }
        return zodResolver(bookingSchema)(...args);
      },`,
      );
      return route.fulfill({ response, body });
    }
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data: unknown = {};
    if (url.pathname.endsWith('/branches'))
      data = [
        { id: branchA, name: 'North', address: 'Synthetic North' },
        { id: branchB, name: 'South' },
      ];
    else if (url.pathname.endsWith('/services'))
      data = [
        {
          id: serviceA,
          name: 'Wash A',
          durationMin: scenario.duration ?? 30,
          price: '100',
        },
        { id: serviceB, name: 'Wash B', durationMin: 30, price: '100' },
      ];
    else if (url.pathname.endsWith('/availability')) {
      const date = url.searchParams.get('date');
      if (date === scenario.delayDate)
        await new Promise<void>((resolve) => {
          scenario.release = resolve;
        });
      if (scenario.fail)
        return route.fulfill({
          status: 500,
          json: { message: 'Synthetic unavailable' },
        });
      data = [
        {
          start: `${date}T12:00:00Z`,
          end: `${date}T12:30:00Z`,
          available: !scenario.unavailable,
          workPostId: 'synthetic-post',
        },
      ];
    } else if (url.pathname.endsWith('/book')) {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      scenario.books.push(payload);
      scenario.bookPaths?.push(url.pathname);
      data = {
        id: 'synthetic-booking',
        branchId: payload.branchId,
        scheduledStart: payload.scheduledStart,
        scheduledEnd: '2030-04-11T12:30:00Z',
        totalPrice: '100',
        branch: { name: 'North' },
        client: { firstName: 'Test' },
        vehicle: { licensePlate: 'TEST123' },
        services: [{ service: { name: 'Wash A', durationMin: 30 } }],
      };
    } else if (url.pathname.includes('/auth/'))
      return route.fulfill({
        status: 400,
        json: { message: 'Synthetic anonymous' },
      });
    return route.fulfill({ json: { data } });
  });
  await page.goto(widget ? '/' : '/public/synthetic-selection/book');
  await page.getByRole('combobox').selectOption(branchA);
  await page
    .getByRole(widget ? 'checkbox' : 'button', { name: /Wash A/ })
    .click();
  if (!widget)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await chooseDate(page, 11);
  await page.getByRole(widget ? 'radio' : 'button', { name: /12:00/ }).click();
}

async function chooseDate(page: Page, day: number) {
  await page
    .getByRole('button', {
      name: widget ? new RegExp(`April ${day}, 2030`) : String(day),
      exact: !widget,
    })
    .click();
}

async function review(page: Page) {
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  if (widget) {
    await page.getByLabel('First Name', { exact: false }).fill('Test');
    await page.getByLabel('Phone', { exact: false }).fill('+380671234567');
    await page.getByLabel('License Plate', { exact: false }).fill('TEST123');
  } else {
    // Dashboard labels are visual labels without htmlFor in the existing form.
    const inputs = page.locator('input');
    await inputs.nth(0).fill('Test');
    await inputs.nth(2).fill('+380671234567');
    await inputs.nth(4).fill('TEST123');
  }
  await page
    .getByRole('button', { name: 'Review Booking', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Confirm Booking', exact: true }),
  ).toBeVisible();
}

test('date change clears selected time before delayed availability and after it resolves', async ({
  page,
}) => {
  const scenario: Scenario = { books: [], delayDate: '2030-04-12' };
  await openBooking(page, scenario);
  await chooseDate(page, 12);
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled();
  await expect.poll(() => typeof scenario.release).toBe('function');
  scenario.release?.();
  await expect(
    page.getByRole(widget ? 'radio' : 'button', { name: /12:00/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled();
  expect(scenario.books).toHaveLength(0);
});

test('branch and same-duration service changes require a fresh time selection', async ({
  page,
}) => {
  const scenario: Scenario = { books: [] };
  await openBooking(page, scenario);
  if (!widget)
    await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('combobox').selectOption(branchB);
  if (!widget)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled();
  await page.getByRole(widget ? 'radio' : 'button', { name: /12:00/ }).click();
  if (!widget)
    await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page
    .getByRole(widget ? 'checkbox' : 'button', { name: /Wash A/ })
    .click();
  await page
    .getByRole(widget ? 'checkbox' : 'button', { name: /Wash B/ })
    .click();
  if (!widget)
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled();
});

test('unchanged context submits the chosen current slot', async ({ page }) => {
  const scenario: Scenario = { books: [] };
  await openBooking(page, scenario);
  await review(page);
  await page
    .getByRole('button', { name: 'Confirm Booking', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Booking Confirmed!' }),
  ).toBeVisible();
  expect(scenario.books).toHaveLength(1);
  expect(scenario.books[0]).toMatchObject({
    branchId: branchA,
    serviceIds: [serviceA],
    scheduledStart: '2030-04-11T12:00:00Z',
  });
});

test('refreshed availability removing the selected slot blocks confirmation', async ({
  page,
}) => {
  const scenario: Scenario = { books: [] };
  await openBooking(page, scenario);
  await review(page);
  scenario.unavailable = true;
  await page.clock.fastForward(31_000);
  const refreshed = page.waitForResponse((response) =>
    response.url().includes('/availability'),
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await refreshed;
  await expect(
    page.getByRole('button', { name: 'Confirm Booking', exact: true }),
  ).toBeDisabled();
  expect(scenario.books).toHaveLength(0);
});

for (const failure of [false, true]) {
  test(`confirmation blocks while availability ${failure ? 'fails' : 'refetches'}`, async ({
    page,
  }) => {
    const scenario: Scenario = { books: [] };
    await openBooking(page, scenario);
    await review(page);
    scenario.delayDate = '2030-04-11';
    scenario.fail = failure;
    await page.clock.fastForward(31_000);
    await page.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
    });
    await expect.poll(() => typeof scenario.release).toBe('function');
    await expect(
      page.getByRole('button', { name: 'Confirm Booking', exact: true }),
    ).toBeDisabled();
    scenario.delayDate = undefined;
    scenario.release?.();
    if (failure) {
      await page.clock.runFor(2_000);
      await expect(
        page.getByRole('button', { name: 'Confirm Booking', exact: true }),
      ).toBeDisabled();
    } else {
      await expect(
        page.getByRole('button', { name: 'Confirm Booking', exact: true }),
      ).toBeEnabled();
    }
    expect(scenario.books).toHaveLength(0);
  });
}

test('catalog duration changes invalidate a selected slot on the review screen', async ({
  page,
}) => {
  const scenario: Scenario = { books: [] };
  await openBooking(page, scenario);
  await review(page);
  scenario.duration = 60;
  await page.clock.fastForward(6 * 60_000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
  });
  await expect(page.getByText('Wash A (1h)', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm Booking', exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText(
    'Please choose an available time again.',
  );
  expect(scenario.books).toHaveLength(0);
});

test('a late previous-date response cannot replace a newer selected time', async ({
  page,
}) => {
  const scenario: Scenario = { books: [], delayDate: '2030-04-12' };
  await openBooking(page, scenario);
  await chooseDate(page, 12);
  await expect.poll(() => typeof scenario.release).toBe('function');
  await chooseDate(page, 13);
  await page.getByRole(widget ? 'radio' : 'button', { name: /12:00/ }).click();
  const lateResponse = page.waitForResponse((response) =>
    response.url().includes('date=2030-04-12'),
  );
  scenario.release?.();
  await lateResponse;
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled();
  await review(page);
  await page
    .getByRole('button', { name: 'Confirm Booking', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Booking Confirmed!' }),
  ).toBeVisible();
  expect(scenario.books).toHaveLength(1);
  expect(scenario.books[0]).toMatchObject({
    scheduledStart: '2030-04-13T12:00:00Z',
  });
});

test('pending validation cannot submit an old selection after an SPA tenant switch', async ({
  page,
}) => {
  const scenario: Scenario = {
    books: [],
    delayedValidation: true,
    bookPaths: [],
  };
  await openBooking(page, scenario);
  await review(page);
  await page.evaluate(() => {
    (window as ValidationGate).__qaHoldValidation = true;
  });
  await page
    .getByRole('button', { name: 'Confirm Booking', exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => (window as ValidationGate).__qaValidationStarted),
    )
    .toBe(true);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/public/other-synthetic-tenant/book');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page).toHaveURL(/other-synthetic-tenant/);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Confirm Booking', exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => {
    const gate = window as ValidationGate;
    gate.__qaHoldValidation = false;
    gate.__qaResumeValidation?.();
  });
  await page.clock.runFor(100);
  await expect(
    page.getByRole('button', { name: 'Confirm Booking', exact: true }),
  ).not.toBeVisible();
  expect(scenario.books).toHaveLength(0);
  expect(scenario.bookPaths).toEqual([]);
  await expect(
    page.getByRole('heading', { name: 'Choose Date & Time' }),
  ).toBeVisible();
});
