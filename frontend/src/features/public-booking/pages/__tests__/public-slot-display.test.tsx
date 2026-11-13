import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import { I18nextProvider } from 'react-i18next';
import { createInstance } from 'i18next';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import en from '@/i18n/locales/en/public-booking.json';
import uk from '@/i18n/locales/uk/public-booking.json';
import { PublicBookingPage } from '../PublicBookingPage';

vi.mock('@/shared/ui/date-picker', () => ({
  CalendarGrid: ({ onChange }: { onChange: (date: string) => void }) => (
    <button onClick={() => onChange('2030-04-10')}>Choose test day</button>
  ),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2030-04-10T09:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it.each(['en', 'uk'])(
  'public %s shows only future starts and expires a selected visible time without navigation',
  async (language) => {
    const branchId = '11111111-1111-4111-8111-111111111111';
    const serviceId = '22222222-2222-4222-8222-222222222222';
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ['public', 'demo', 'branches'],
      [{ id: branchId, name: 'North' }],
    );
    client.setQueryData(
      ['public', 'demo', 'services'],
      [{ id: serviceId, name: 'Wash', durationMin: 30, price: 100 }],
    );
    client.setQueryData(
      [
        'public',
        'demo',
        'availability',
        { branchId, date: '2030-04-10', durationMinutes: 30 },
      ],
      [
        { start: '2030-04-10T11:59:00+03:00', available: true },
        { start: '2030-04-10T12:00:00+03:00', available: true },
        { start: '2030-04-10T12:01:00+03:00', available: true },
      ],
    );
    const i18n = createInstance();
    await i18n.init({
      lng: language,
      resources: { en: { 'public-booking': en }, uk: { 'public-booking': uk } },
    });
    render(
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>
          <MemoryRouter initialEntries={['/public/demo/book']}>
            <Routes>
              <Route
                path="/public/:slug/book"
                element={<PublicBookingPage />}
              />
            </Routes>
          </MemoryRouter>
        </I18nextProvider>
      </QueryClientProvider>,
    );
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), {
        target: { value: branchId },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Wash/ }));
    });
    const next = language === 'en' ? 'Continue' : 'Продовжити';
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: next, exact: true }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose test day' }));
    });
    expect(
      screen.getAllByRole('button', { name: /^\d{2}:\d{2}$/ }),
    ).toHaveLength(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^\d{2}:\d{2}$/ }));
    });
    expect(
      screen.getByRole('button', { name: next, exact: true }),
    ).toBeEnabled();
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(
      screen.queryByRole('button', { name: /^\d{2}:\d{2}$/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(language === 'en' ? en.noSlots : uk.noSlots),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: next, exact: true }),
    ).toBeDisabled();
  },
);
