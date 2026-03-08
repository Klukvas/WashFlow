import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchOrders,
  fetchOrder,
  createOrder,
  updateOrderStatus,
  deleteOrder,
  restoreOrder,
  fetchAvailability,
} from '../orders.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  toPaginated: vi.fn((resp) => ({
    items: resp.data,
    meta: {
      total: resp.meta.total,
      page: resp.meta.page,
      limit: resp.meta.limit,
      totalPages: resp.meta.totalPages,
    },
  })),
  withIdempotencyKey: vi.fn(() => ({
    headers: { 'idempotency-key': 'mock-key' },
  })),
}));

import { apiClient, withIdempotencyKey } from '@/shared/api/client';

const mockOrder = {
  id: 'o1',
  branchId: 'b1',
  clientId: 'c1',
  vehicleId: 'v1',
  status: 'BOOKED',
};

describe('orders.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchOrders calls GET /orders', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockOrder],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchOrders({ page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/orders', {
      params: { page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchOrder calls GET /orders/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockOrder },
    });

    const result = await fetchOrder('o1');

    expect(apiClient.get).toHaveBeenCalledWith('/orders/o1');
    expect(result.id).toBe('o1');
  });

  it('createOrder calls POST /orders with idempotency key', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockOrder },
    });

    const payload = {
      branchId: 'b1',
      clientId: 'c1',
      vehicleId: 'v1',
      scheduledStart: '2026-03-10T10:00:00Z',
      serviceIds: ['s1'],
    };
    await createOrder(payload);

    expect(withIdempotencyKey).toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/orders',
      payload,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('updateOrderStatus calls PATCH /orders/:id/status', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockOrder, status: 'IN_PROGRESS' } },
    });

    const result = await updateOrderStatus('o1', {
      status: 'IN_PROGRESS' as any,
    });

    expect(apiClient.patch).toHaveBeenCalledWith('/orders/o1/status', {
      status: 'IN_PROGRESS',
    });
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('deleteOrder calls DELETE /orders/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    await deleteOrder('o1');

    expect(apiClient.delete).toHaveBeenCalledWith('/orders/o1');
  });

  it('restoreOrder calls PATCH /orders/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockOrder },
    });

    const result = await restoreOrder('o1');

    expect(apiClient.patch).toHaveBeenCalledWith('/orders/o1/restore');
    expect(result.id).toBe('o1');
  });

  it('fetchAvailability calls GET /orders/availability', async () => {
    const slots = [
      {
        start: '10:00',
        end: '10:30',
        workPostId: 'wp1',
        workPostName: 'Post 1',
        available: true,
      },
    ];
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: slots },
    });

    const result = await fetchAvailability({
      branchId: 'b1',
      date: '2026-03-10',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/orders/availability', {
      params: { branchId: 'b1', date: '2026-03-10' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].available).toBe(true);
  });
});
