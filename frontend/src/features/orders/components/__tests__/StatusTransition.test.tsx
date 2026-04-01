import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StatusTransition } from '../StatusTransition';
import { OrderStatus } from '@/shared/types/enums';

const mockMutate = vi.fn();
let mockIsPending = false;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) return `${key}:${JSON.stringify(params)}`;
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('../../hooks/useOrders', () => ({
  useUpdateOrderStatus: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('StatusTransition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
  });

  it('renders transition buttons for BOOKED status', () => {
    render(
      <StatusTransition orderId="order-1" currentStatus={OrderStatus.BOOKED} />,
      { wrapper: createWrapper() },
    );

    // BOOKED can transition to IN_PROGRESS, CANCELLED, NO_SHOW
    expect(screen.getByText('statusChange.start')).toBeInTheDocument();
    expect(screen.getByText('statusChange.cancelOrder')).toBeInTheDocument();
    expect(screen.getByText('statusChange.noShow')).toBeInTheDocument();
  });

  it('renders nothing for COMPLETED status (terminal state)', () => {
    render(
      <StatusTransition
        orderId="order-1"
        currentStatus={OrderStatus.COMPLETED}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing for CANCELLED status (terminal state)', () => {
    render(
      <StatusTransition
        orderId="order-1"
        currentStatus={OrderStatus.CANCELLED}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('opens confirmation dialog when clicking a non-cancel transition', async () => {
    const user = userEvent.setup();

    render(
      <StatusTransition orderId="order-1" currentStatus={OrderStatus.BOOKED} />,
      { wrapper: createWrapper() },
    );

    await user.click(screen.getByText('statusChange.start'));

    // Confirmation dialog should appear with the status change message
    expect(
      screen.getByText(/statusChange.confirmTransition/),
    ).toBeInTheDocument();
  });

  it('opens cancellation dialog with reason input when clicking cancel', async () => {
    const user = userEvent.setup();

    render(
      <StatusTransition orderId="order-1" currentStatus={OrderStatus.BOOKED} />,
      { wrapper: createWrapper() },
    );

    await user.click(screen.getByText('statusChange.cancelOrder'));

    // The cancellation dialog should have a reason input
    expect(
      screen.getByPlaceholderText('statusChange.cancellationReason'),
    ).toBeInTheDocument();
  });

  it('renders transition buttons for IN_PROGRESS status', () => {
    render(
      <StatusTransition
        orderId="order-1"
        currentStatus={OrderStatus.IN_PROGRESS}
      />,
      { wrapper: createWrapper() },
    );

    // IN_PROGRESS can go to COMPLETED or CANCELLED
    expect(screen.getByText('statusChange.complete')).toBeInTheDocument();
    expect(screen.getByText('statusChange.cancelOrder')).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons for BOOKED_PENDING_CONFIRMATION', () => {
    render(
      <StatusTransition
        orderId="order-1"
        currentStatus={OrderStatus.BOOKED_PENDING_CONFIRMATION}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText('statusChange.confirm')).toBeInTheDocument();
    expect(screen.getByText('statusChange.cancelOrder')).toBeInTheDocument();
    expect(screen.getByText('statusChange.noShow')).toBeInTheDocument();
  });
});
