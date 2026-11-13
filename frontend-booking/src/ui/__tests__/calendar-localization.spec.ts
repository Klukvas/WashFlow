import { test, expect } from '@playwright/test';

test('calendar translates month, weekdays, navigation and day labels while retaining the selected date', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2030-04-10T09:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('booking-lang', 'en'));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() !== 'GET')
      throw new Error('Unexpected write in read-only calendar check');
    const data = url.pathname.endsWith('/branches')
      ? [
          { id: '11111111-1111-4111-8111-111111111111', name: 'North' },
          { id: '33333333-3333-4333-8333-333333333333', name: 'South' },
        ]
      : url.pathname.endsWith('/services')
        ? [
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Wash',
              durationMin: 30,
              price: 100,
            },
          ]
        : [];
    return route.fulfill({ json: { data } });
  });
  await page.goto('/');
  await page
    .getByRole('combobox')
    .selectOption('11111111-1111-4111-8111-111111111111');
  await page.getByRole('checkbox', { name: /Wash/ }).check();
  const calendar = page.getByRole('group', { name: 'April 2030' });
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('columnheader')).toHaveText([
    'Mo',
    'Tu',
    'We',
    'Th',
    'Fr',
    'Sa',
    'Su',
  ]);
  await page.getByRole('button', { name: 'Thursday, April 11, 2030' }).click();
  await expect(page.locator('[aria-selected="true"]')).toHaveText('11');
  await page.getByRole('button', { name: 'UA', exact: true }).click();
  const ukrainian = page.getByRole('group', { name: /квітень 2030/i });
  await expect(ukrainian).toBeVisible();
  await expect(ukrainian.getByRole('columnheader')).toHaveText([
    'пн',
    'вт',
    'ср',
    'чт',
    'пт',
    'сб',
    'нд',
  ]);
  await expect(page.locator('[aria-selected="true"]')).toHaveAttribute(
    'aria-label',
    /четвер.*11.*квітня.*2030/i,
  );
  await page.getByRole('button', { name: 'Наступний місяць' }).click();
  await expect(
    page.getByRole('group', { name: /травень 2030/i }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Попередній місяць' }).click();
  await expect(page.locator('[aria-selected="true"]')).toHaveText('11');
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Thursday, April 11, 2030' }),
  ).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Next month' }).click();
  await expect(page.getByRole('group', { name: 'May 2030' })).toBeVisible();
  await page.getByRole('button', { name: 'Previous month' }).click();
  await expect(page.locator('[aria-selected="true"]')).toHaveText('11');
});

test('cached widget times disappear at their exact start and disable continuation', async ({
  page,
}) => {
  await page.clock.install({ time: new Date('2030-04-10T09:00:00Z') });
  await page.addInitScript(() => localStorage.setItem('booking-lang', 'en'));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname))
      return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (route.request().method() !== 'GET') throw new Error('Unexpected write');
    const data = url.pathname.endsWith('/branches')
      ? [{ id: '11111111-1111-4111-8111-111111111111', name: 'North' }]
      : url.pathname.endsWith('/services')
        ? [
            {
              id: '22222222-2222-4222-8222-222222222222',
              name: 'Wash',
              durationMin: 30,
              price: 100,
            },
          ]
        : [
            {
              start: '2030-04-10T11:59:00+03:00',
              end: '2030-04-10T12:29:00+03:00',
              available: true,
              workPostId: 'past',
            },
            {
              start: '2030-04-10T12:01:00+03:00',
              end: '2030-04-10T12:31:00+03:00',
              available: true,
              workPostId: 'future',
            },
          ];
    return route.fulfill({ json: { data } });
  });
  await page.goto('/');
  await page.getByRole('checkbox', { name: /Wash/ }).check();
  await page.getByRole('button', { name: 'Wednesday, April 10, 2030' }).click();
  await expect(page.getByRole('radio')).toHaveCount(1);
  await page.getByRole('radio').click();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeEnabled();
  await page.clock.fastForward(60_000);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(
    page.getByText('No available slots for this date', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Continue', exact: true }),
  ).toBeDisabled();
});
