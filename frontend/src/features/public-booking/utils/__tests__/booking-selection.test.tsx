import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import {
  bookingContext,
  isBookingSelectionCurrent,
  useBookingSelection,
} from '../booking-selection';

const date = '2030-04-11';
const start = `${date}T12:00:00Z`;
const services = [{ id: 'wash', durationMin: 30 }];
const context = bookingContext('tenant', 'branch', date, ['wash'], services);
const selection = { context, start };
const available = {
  status: 'success',
  fetchStatus: 'idle',
  data: [{ start, available: true }],
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-04-10T09:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('booking selection contract', () => {
  it('accepts an unchanged selection present in successful idle availability', () => {
    expect(
      isBookingSelectionCurrent(selection, context, start, available),
    ).toBe(true);
  });

  it.each([
    ['tenant', 'other', date, ['wash'], services],
    ['other', 'branch', date, ['wash'], services],
    ['tenant', 'branch', '2030-04-12', ['wash'], services],
    ['tenant', 'branch', date, ['other'], [{ id: 'other', durationMin: 30 }]],
    ['tenant', 'branch', date, ['wash'], [{ id: 'wash', durationMin: 60 }]],
  ] as const)(
    'invalidates a changed selection context %j',
    (tenant, branch, day, ids, catalog) => {
      const next = bookingContext(tenant, branch, day, [...ids], [...catalog]);
      expect(isBookingSelectionCurrent(selection, next, start, available)).toBe(
        false,
      );
    },
  );

  it.each([
    undefined,
    { ...available, status: 'pending' },
    { ...available, status: 'error' },
    { ...available, fetchStatus: 'fetching' },
    { ...available, fetchStatus: 'paused' },
    { ...available, data: [] },
    { ...available, data: [{ start, available: false }] },
    {
      ...available,
      data: [{ start: '2030-04-11T13:00:00Z', available: true }],
    },
  ])(
    'rejects unavailable, failed or refreshing query state %j',
    (availability) => {
      expect(
        isBookingSelectionCurrent(selection, context, start, availability),
      ).toBe(false);
    },
  );

  it('rejects an expired slot and a timestamp different from the selected one', () => {
    expect(
      isBookingSelectionCurrent(
        selection,
        context,
        '2030-04-11T13:00:00Z',
        available,
      ),
    ).toBe(false);
    vi.setSystemTime(new Date(start));
    expect(
      isBookingSelectionCurrent(selection, context, start, available),
    ).toBe(false);
  });
});

function setupSelection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  let values = { branchId: 'branch', serviceIds: ['wash'], scheduledStart: '' };
  const key = [
    'public',
    'tenant',
    'availability',
    { branchId: 'branch', date, durationMinutes: 30 },
  ];
  const servicesKey = ['public', 'tenant', 'services'];
  client.setQueryData(key, available.data);
  client.setQueryData(servicesKey, services);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ tenant, day }) =>
      useBookingSelection({
        tenant,
        date: day,
        services,
        durationMinutes: 30,
        getValues: () => values,
        setScheduledStart: (scheduledStart) => {
          values = { ...values, scheduledStart };
        },
      }),
    { wrapper, initialProps: { tenant: 'tenant', day: date } },
  );
  act(() => hook.result.current.selectSlot(start));
  return {
    client,
    key,
    servicesKey,
    hook,
    changeServices: () => {
      values = { ...values, serviceIds: ['other'] };
    },
  };
}

describe('asynchronous form action boundaries', () => {
  it('reads current availability after async validation instead of the render snapshot', async () => {
    const { client, key, hook } = setupSelection();
    const submitAfterValidation = hook.result.current.hasCurrentSelection;
    expect(submitAfterValidation()).toBe(true);
    await Promise.resolve();
    act(() => client.setQueryData(key, []));
    expect(submitAfterValidation()).toBe(false);
  });

  it('rejects a refetch already started before React rerenders', async () => {
    const { client, key, hook } = setupSelection();
    const submitAfterValidation = hook.result.current.hasCurrentSelection;
    let finish: ((slots: typeof available.data) => void) | undefined;
    let fetch: Promise<unknown> | undefined;
    act(() => {
      fetch = client.fetchQuery({
        queryKey: key,
        queryFn: () =>
          new Promise<typeof available.data>((resolve) => {
            finish = resolve;
          }),
      });
      expect(submitAfterValidation()).toBe(false);
    });
    finish?.(available.data);
    await act(async () => {
      await fetch;
    });
    expect(submitAfterValidation()).toBe(true);
  });

  it('clears synchronously so an already captured submit cannot reuse the time', () => {
    const { hook } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    act(() => {
      hook.result.current.clearSelectedSlot();
      expect(captured()).toBe(false);
    });
  });

  it('rejects a catalog duration change received while validation awaits', () => {
    const { client, servicesKey, hook } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    client.setQueryData(servicesKey, [{ id: 'wash', durationMin: 60 }]);
    expect(captured()).toBe(false);
  });

  it('rejects a same-duration service replacement even before the next render', () => {
    const { client, servicesKey, hook, changeServices } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    client.setQueryData(servicesKey, [
      ...services,
      { id: 'other', durationMin: 30 },
    ]);
    changeServices();
    expect(captured()).toBe(false);
  });
});

describe('retained callbacks across route context changes', () => {
  it('rejects the previous tenant callback after a tenant rerender', () => {
    const { client, hook } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    client.setQueryData(['public', 'other', 'services'], services);
    client.setQueryData(
      [
        'public',
        'other',
        'availability',
        { branchId: 'branch', date, durationMinutes: 30 },
      ],
      available.data,
    );
    hook.rerender({ tenant: 'other', day: date });
    expect(hook.result.current.hasSelectedSlot).toBe(false);
    expect(captured()).toBe(false);
  });

  it('rejects the previous date callback even with its successful cached query', () => {
    const { client, hook } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    const nextDate = '2030-04-12';
    client.setQueryData(
      [
        'public',
        'tenant',
        'availability',
        { branchId: 'branch', date: nextDate, durationMinutes: 30 },
      ],
      available.data,
    );
    hook.rerender({ tenant: 'tenant', day: nextDate });
    expect(captured()).toBe(false);
  });

  it('rejects a callback retained after the booking page unmounts', () => {
    const { hook } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    hook.unmount();
    expect(captured()).toBe(false);
  });

  it('does not revive an old selection when navigating back to the original tenant', () => {
    const { client, hook } = setupSelection();
    const captured = hook.result.current.hasCurrentSelection;
    client.setQueryData(['public', 'other', 'services'], services);
    client.setQueryData(
      [
        'public',
        'other',
        'availability',
        { branchId: 'branch', date, durationMinutes: 30 },
      ],
      available.data,
    );
    hook.rerender({ tenant: 'other', day: date });
    hook.rerender({ tenant: 'tenant', day: date });
    expect(hook.result.current.hasSelectedSlot).toBe(false);
    expect(captured()).toBe(false);
  });
});

it('keeps a previous callback invalid after returning and selecting the same time again', () => {
  const { client, hook } = setupSelection();
  const captured = hook.result.current.hasCurrentSelection;
  client.setQueryData(['public', 'other', 'services'], services);
  client.setQueryData(
    [
      'public',
      'other',
      'availability',
      { branchId: 'branch', date, durationMinutes: 30 },
    ],
    available.data,
  );
  hook.rerender({ tenant: 'other', day: date });
  hook.rerender({ tenant: 'tenant', day: date });
  act(() => hook.result.current.selectSlot(start));
  expect(hook.result.current.hasCurrentSelection()).toBe(true);
  expect(captured()).toBe(false);
});
