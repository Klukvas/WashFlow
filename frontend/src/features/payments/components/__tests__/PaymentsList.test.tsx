import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { PaymentsList } from '../PaymentsList';

let mockData: any[] | undefined = undefined;
let mockIsLoading = false;

vi.mock('../../hooks/usePayments', () => ({
  usePayments: () => ({
    data: mockData,
    isLoading: mockIsLoading,
  }),
}));

vi.mock('@/shared/utils/format', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
  formatDateTime: (v: string) => `formatted:${v}`,
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('PaymentsList', () => {
  beforeEach(() => {
    mockData = undefined;
    mockIsLoading = false;
  });

  it('shows skeleton while loading', () => {
    mockIsLoading = true;
    const { container } = render(<PaymentsList orderId="o1" />, {
      wrapper: createWrapper(),
    });
    expect(container.querySelector('.h-24')).toBeInTheDocument();
  });

  it('shows empty state when no payments', () => {
    mockData = [];
    render(<PaymentsList orderId="o1" />, { wrapper: createWrapper() });
    expect(screen.getByText('No payments recorded')).toBeInTheDocument();
  });

  it('renders payment rows with amount, datetime, method, status', () => {
    mockData = [
      { id: 'p1', amount: 100, createdAt: '2026-01-15T10:00:00Z', method: 'CASH', status: 'PAID' },
      { id: 'p2', amount: 50, createdAt: '2026-01-16T12:00:00Z', method: 'CARD', status: 'PENDING' },
    ];

    render(<PaymentsList orderId="o1" />, { wrapper: createWrapper() });

    expect(screen.getByText('$100.00')).toBeInTheDocument();
    expect(screen.getByText('$50.00')).toBeInTheDocument();
    expect(screen.getByText('CASH')).toBeInTheDocument();
    expect(screen.getByText('CARD')).toBeInTheDocument();
    expect(screen.getByText('PAID')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('formats datetime', () => {
    mockData = [
      { id: 'p1', amount: 100, createdAt: '2026-01-15', method: 'CASH', status: 'PAID' },
    ];

    render(<PaymentsList orderId="o1" />, { wrapper: createWrapper() });
    expect(screen.getByText('formatted:2026-01-15')).toBeInTheDocument();
  });

  it('shows empty state when data is null', () => {
    mockData = undefined;
    render(<PaymentsList orderId="o1" />, { wrapper: createWrapper() });
    expect(screen.getByText('No payments recorded')).toBeInTheDocument();
  });
});
