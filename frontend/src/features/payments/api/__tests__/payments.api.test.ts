import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPayments, createPayment } from '../payments.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
  withIdempotencyKey: vi.fn(() => ({
    headers: { 'idempotency-key': 'mock-key' },
  })),
}));

import { apiClient } from '@/shared/api/client';

const mockPayment = {
  id: 'pay1',
  orderId: 'o1',
  amount: 500,
  method: 'CASH',
};

describe('payments.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchPayments calls GET /orders/:id/payments', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: [mockPayment] },
    });

    const result = await fetchPayments('o1');

    expect(apiClient.get).toHaveBeenCalledWith('/orders/o1/payments');
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(500);
  });

  it('createPayment calls POST /orders/:id/payments with idempotency key', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockPayment },
    });

    const payload = { amount: 500, method: 'CASH' as any };
    const result = await createPayment('o1', payload);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/orders/o1/payments',
      payload,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(result.id).toBe('pay1');
  });
});
