import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useOrders,
  useOrder,
  useCreateOrder,
  useUpdateOrderStatus,
  useDeleteOrder,
  useRestoreOrder,
  useAvailability,
} from '../useOrders';
import type {
  OrderQueryParams,
  CreateOrderPayload,
  AvailabilityParams,
} from '../../api/orders.api';
import type { Order } from '@/shared/types/models';
import type { PaginatedResponse, TimeSlot } from '@/shared/types/api';

vi.mock('../../api/orders.api', () => ({
  fetchOrders: vi.fn(),
  fetchOrder: vi.fn(),
  createOrder: vi.fn(),
  updateOrderStatus: vi.fn(),
  deleteOrder: vi.fn(),
  restoreOrder: vi.fn(),
  fetchAvailability: vi.fn(),
}));

import {
  fetchOrders,
  fetchOrder,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  restoreOrder,
  fetchAvailability,
} from '../../api/orders.api';

const mockedFetchOrders = vi.mocked(fetchOrders);
const mockedFetchOrder = vi.mocked(fetchOrder);
const mockedCreateOrder = vi.mocked(createOrder);
const mockedUpdateOrderStatus = vi.mocked(updateOrderStatus);
const mockedDeleteOrder = vi.mocked(deleteOrder);
const mockedRestoreOrder = vi.mocked(restoreOrder);
const mockedFetchAvailability = vi.mocked(fetchAvailability);

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

const fakeOrder: Order = {
  id: 'order-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  clientId: 'client-1',
  vehicleId: 'vehicle-1',
  workPostId: null,
  createdById: null,
  status: 'BOOKED',
  source: 'INTERNAL',
  scheduledStart: '2026-03-15T10:00:00Z',
  scheduledEnd: '2026-03-15T11:00:00Z',
  totalPrice: 100,
  notes: null,
  cancellationReason: null,
  createdAt: '2026-03-15T09:00:00Z',
  updatedAt: '2026-03-15T09:00:00Z',
  deletedAt: null,
};

const fakePaginatedResponse: PaginatedResponse<Order> = {
  items: [fakeOrder],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

const fakeTimeSlots: TimeSlot[] = [
  {
    start: '2026-03-15T10:00:00Z',
    end: '2026-03-15T11:00:00Z',
    workPostId: 'wp-1',
    workPostName: 'Post 1',
    available: true,
  },
];

describe('useOrders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches orders with the given params', async () => {
    mockedFetchOrders.mockResolvedValueOnce(fakePaginatedResponse);
    const params: OrderQueryParams = { page: 1, limit: 10 };

    const { result } = renderHook(() => useOrders(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchOrders).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual(fakePaginatedResponse);
  });

  it('includes params in the query key', async () => {
    mockedFetchOrders.mockResolvedValue(fakePaginatedResponse);
    const params1: OrderQueryParams = { page: 1 };
    const params2: OrderQueryParams = { page: 2 };

    const wrapper = createWrapper();

    const { result: result1 } = renderHook(() => useOrders(params1), {
      wrapper,
    });
    const { result: result2 } = renderHook(() => useOrders(params2), {
      wrapper,
    });

    await waitFor(() => expect(result1.current.isSuccess).toBe(true));
    await waitFor(() => expect(result2.current.isSuccess).toBe(true));

    expect(mockedFetchOrders).toHaveBeenCalledTimes(2);
    expect(mockedFetchOrders).toHaveBeenCalledWith(params1);
    expect(mockedFetchOrders).toHaveBeenCalledWith(params2);
  });

  it('propagates fetch errors', async () => {
    const error = new Error('Network error');
    mockedFetchOrders.mockRejectedValueOnce(error);

    const { result } = renderHook(
      () => useOrders({ page: 1 }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});

describe('useOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single order by id', async () => {
    mockedFetchOrder.mockResolvedValueOnce(fakeOrder);

    const { result } = renderHook(() => useOrder('order-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchOrder).toHaveBeenCalledWith('order-1');
    expect(result.current.data).toEqual(fakeOrder);
  });

  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useOrder(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetchOrder).not.toHaveBeenCalled();
  });
});

describe('useCreateOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createOrder API and returns the result', async () => {
    mockedCreateOrder.mockResolvedValueOnce(fakeOrder);
    const payload: CreateOrderPayload = {
      branchId: 'branch-1',
      clientId: 'client-1',
      vehicleId: 'vehicle-1',
      scheduledStart: '2026-03-15T10:00:00Z',
      serviceIds: ['svc-1'],
    };

    const { result } = renderHook(() => useCreateOrder(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCreateOrder).toHaveBeenCalledWith(payload);
    expect(result.current.data).toEqual(fakeOrder);
  });

  it('invalidates orders, dashboard, and availability queries on settled', async () => {
    mockedCreateOrder.mockResolvedValueOnce(fakeOrder);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useCreateOrder(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({
        branchId: 'b-1',
        clientId: 'c-1',
        vehicleId: 'v-1',
        scheduledStart: '2026-03-15T10:00:00Z',
        serviceIds: ['s-1'],
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['availability'] });
  });
});

describe('useUpdateOrderStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateOrderStatus with id and payload', async () => {
    const updatedOrder = { ...fakeOrder, status: 'IN_PROGRESS' as const };
    mockedUpdateOrderStatus.mockResolvedValueOnce(updatedOrder);

    const { result } = renderHook(() => useUpdateOrderStatus(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ id: 'order-1', status: 'IN_PROGRESS' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedUpdateOrderStatus).toHaveBeenCalledWith('order-1', {
      status: 'IN_PROGRESS',
    });
  });

  it('invalidates orders, specific order, dashboard, and availability on settled', async () => {
    const updatedOrder = { ...fakeOrder, status: 'IN_PROGRESS' as const };
    mockedUpdateOrderStatus.mockResolvedValueOnce(updatedOrder);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useUpdateOrderStatus(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({ id: 'order-1', status: 'IN_PROGRESS' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['orders', 'order-1'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['availability'],
    });
  });
});

describe('useDeleteOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteOrder API with the id', async () => {
    mockedDeleteOrder.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteOrder(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('order-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDeleteOrder).toHaveBeenCalledWith('order-1');
  });

  it('invalidates orders and availability queries on settled', async () => {
    mockedDeleteOrder.mockResolvedValueOnce(undefined);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useDeleteOrder(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate('order-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['availability'],
    });
  });
});

describe('useRestoreOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls restoreOrder API with the id', async () => {
    mockedRestoreOrder.mockResolvedValueOnce(fakeOrder);

    const { result } = renderHook(() => useRestoreOrder(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('order-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRestoreOrder).toHaveBeenCalledWith('order-1');
    expect(result.current.data).toEqual(fakeOrder);
  });

  it('invalidates orders and availability queries on settled', async () => {
    mockedRestoreOrder.mockResolvedValueOnce(fakeOrder);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      );
    }

    const { result } = renderHook(() => useRestoreOrder(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate('order-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['orders'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['availability'],
    });
  });
});

describe('useAvailability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches availability with the given params', async () => {
    mockedFetchAvailability.mockResolvedValueOnce(fakeTimeSlots);
    const params: AvailabilityParams = {
      branchId: 'branch-1',
      date: '2026-03-15',
    };

    const { result } = renderHook(() => useAvailability(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchAvailability).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual(fakeTimeSlots);
  });

  it('is disabled when branchId is missing', () => {
    const params = { branchId: '', date: '2026-03-15' } as AvailabilityParams;

    const { result } = renderHook(() => useAvailability(params), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetchAvailability).not.toHaveBeenCalled();
  });

  it('is disabled when date is missing', () => {
    const params = { branchId: 'branch-1', date: '' } as AvailabilityParams;

    const { result } = renderHook(() => useAvailability(params), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetchAvailability).not.toHaveBeenCalled();
  });
});
