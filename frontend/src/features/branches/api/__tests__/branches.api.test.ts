import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchBranches,
  fetchAllBranches,
  normalizeBookingSettings,
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

    expect(apiClient.patch).toHaveBeenCalledWith('/branches/b1', {
      name: 'Updated',
    });
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
      id: '11111111-1111-4111-8111-111111111111',
      tenantId: '22222222-2222-4222-8222-222222222222',
      branchId: '33333333-3333-4333-8333-333333333333',
      slotDurationMinutes: 30,
      bufferTimeMinutes: 10,
      allowOnlineBooking: true,
      workingHoursStart: '08:00',
      workingHoursEnd: '18:00',
      workingDays: [1],
      maxAdvanceBookingDays: 30,
    };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockSettings },
    });

    const result = await fetchBranchBookingSettings(
      '33333333-3333-4333-8333-333333333333',
    );

    expect(apiClient.get).toHaveBeenCalledWith(
      '/branches/33333333-3333-4333-8333-333333333333/booking-settings',
    );
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

    const result = await updateBranchBookingSettings('b1', {
      slotDurationMinutes: 45,
    });

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/branches/b1/booking-settings',
      { slotDurationMinutes: 45 },
    );
    expect(result.slotDurationMinutes).toBe(45);
  });
});

describe('setup branch contracts', () => {
  it('recognizes only the known legacy fallback as unsaved', () => {
    const fallback = {
      workStartTime: '09:00',
      workEndTime: '18:00',
      slotDuration: 60,
      workingDays: [1, 2, 3, 4, 5],
      maxAdvanceBookingDays: 30,
      requireConfirmation: false,
    };
    expect(normalizeBookingSettings(fallback, 'branch')).toBeNull();
    expect(() =>
      normalizeBookingSettings({ ...fallback, id: 'malformed' }, 'branch'),
    ).toThrow();
    expect(() =>
      normalizeBookingSettings({ workingHoursStart: '09:00' }, 'branch'),
    ).toThrow();
  });
  it('loads all branch pages and rejects inconsistent pagination', async () => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: {
          data: [mockBranch],
          meta: { total: 2, page: 1, limit: 100, totalPages: 2 },
        },
      })
      .mockResolvedValueOnce({
        data: {
          data: [{ ...mockBranch, id: 'b2' }],
          meta: { total: 2, page: 2, limit: 100, totalPages: 2 },
        },
      });
    expect((await fetchAllBranches()).map((b) => b.id)).toEqual(['b1', 'b2']);
    expect(apiClient.get).toHaveBeenLastCalledWith('/branches', {
      params: { page: 2, limit: 100 },
    });
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [],
        meta: { total: 2, page: 1, limit: 100, totalPages: 2 },
      },
    });
    await expect(fetchAllBranches()).rejects.toThrow();
  });
});
