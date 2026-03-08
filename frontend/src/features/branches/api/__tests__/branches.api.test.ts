import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchBranches,
  fetchBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  restoreBranch,
  fetchBranchBookingSettings,
  updateBranchBookingSettings,
} from '../branches.api';

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

const mockBranch = {
  id: 'b1',
  name: 'Main Branch',
  address: '123 Main St',
  phone: '+380991234567',
};

describe('branches.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchBranches calls GET /branches', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockBranch],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchBranches({ page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/branches', {
      params: { page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchBranch calls GET /branches/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockBranch },
    });

    const result = await fetchBranch('b1');

    expect(apiClient.get).toHaveBeenCalledWith('/branches/b1');
    expect(result.name).toBe('Main Branch');
  });

  it('createBranch calls POST /branches with idempotency key', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockBranch },
    });

    await createBranch({ name: 'Main Branch' });

    expect(withIdempotencyKey).toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/branches',
      { name: 'Main Branch' },
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('updateBranch calls PATCH /branches/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockBranch, name: 'Updated' } },
    });

    const result = await updateBranch('b1', { name: 'Updated' });

    expect(apiClient.patch).toHaveBeenCalledWith('/branches/b1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('deleteBranch calls DELETE /branches/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    await deleteBranch('b1');

    expect(apiClient.delete).toHaveBeenCalledWith('/branches/b1');
  });

  it('restoreBranch calls PATCH /branches/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockBranch },
    });

    const result = await restoreBranch('b1');

    expect(apiClient.patch).toHaveBeenCalledWith('/branches/b1/restore');
    expect(result.id).toBe('b1');
  });

  it('fetchBranchBookingSettings calls GET /branches/:id/booking-settings', async () => {
    const mockSettings = {
      slotDurationMinutes: 30,
      bufferTimeMinutes: 10,
      allowOnlineBooking: true,
    };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockSettings },
    });

    const result = await fetchBranchBookingSettings('b1');

    expect(apiClient.get).toHaveBeenCalledWith('/branches/b1/booking-settings');
    expect(result).toEqual(mockSettings);
  });

  it('updateBranchBookingSettings calls PATCH /branches/:id/booking-settings', async () => {
    const mockSettings = {
      slotDurationMinutes: 45,
      allowOnlineBooking: false,
    };
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockSettings },
    });

    const result = await updateBranchBookingSettings('b1', { slotDurationMinutes: 45 });

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/branches/b1/booking-settings',
      { slotDurationMinutes: 45 },
    );
    expect(result.slotDurationMinutes).toBe(45);
  });
});
