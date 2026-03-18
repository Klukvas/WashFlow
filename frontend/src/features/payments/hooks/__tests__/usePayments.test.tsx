import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePayments, useCreatePayment } from '../usePayments';

vi.mock('../../api/payments.api', () => ({
  fetchPayments: vi.fn(),
  createPayment: vi.fn(),
}));

import { fetchPayments, createPayment } from '../../api/payments.api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('usePayments', () => {
  it('calls fetchPayments with orderId', async () => {
    const data = [{ id: 'p1', amount: 100 }];
    vi.mocked(fetchPayments).mockResolvedValueOnce(data as any);

    const { result } = renderHook(() => usePayments('order-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchPayments).toHaveBeenCalledWith('order-1');
    expect(result.current.data).toEqual(data);
  });

  it('is disabled when orderId is empty', () => {
    const { result } = renderHook(() => usePayments(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
  });

  it('handles errors', async () => {
    vi.mocked(fetchPayments).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => usePayments('order-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useCreatePayment', () => {
  it('calls createPayment with orderId and payload', async () => {
    const payment = { id: 'p1', amount: 50 };
    vi.mocked(createPayment).mockResolvedValueOnce(payment as any);

    const { result } = renderHook(() => useCreatePayment('order-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ amount: 50, method: 'CASH' as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createPayment).toHaveBeenCalledWith('order-1', { amount: 50, method: 'CASH' });
  });

  it('invalidates payments and orders queries on success', async () => {
    vi.mocked(createPayment).mockResolvedValueOnce({ id: 'p1' } as any);

    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useCreatePayment('order-1'), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({ amount: 50, method: 'CASH' as any });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['payments', 'order-1'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] });
  });

  it('handles errors', async () => {
    vi.mocked(createPayment).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useCreatePayment('order-1'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ amount: 50, method: 'CASH' as any });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
