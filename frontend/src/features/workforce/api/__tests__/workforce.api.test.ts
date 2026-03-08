import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchProfiles,
  fetchProfile,
  createProfile,
  updateProfile,
  deactivateProfile,
} from '../workforce.api';

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
}));

import { apiClient } from '@/shared/api/client';

const mockProfile = {
  id: 'ep1',
  userId: 'u1',
  branchId: 'b1',
  isWorker: true,
  active: true,
  efficiencyCoefficient: 1.0,
};

describe('workforce.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchProfiles calls GET /workforce/profiles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockProfile],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchProfiles({ branchId: 'b1' });
    expect(apiClient.get).toHaveBeenCalledWith('/workforce/profiles', {
      params: { branchId: 'b1' },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchProfile calls GET /workforce/profiles/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockProfile },
    });

    const result = await fetchProfile('ep1');
    expect(apiClient.get).toHaveBeenCalledWith('/workforce/profiles/ep1');
    expect(result.userId).toBe('u1');
  });

  it('createProfile calls POST /workforce/profiles', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockProfile },
    });

    const payload = { userId: 'u1', branchId: 'b1', isWorker: true };
    const result = await createProfile(payload);
    expect(apiClient.post).toHaveBeenCalledWith('/workforce/profiles', payload);
    expect(result.id).toBe('ep1');
  });

  it('updateProfile calls PATCH /workforce/profiles/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockProfile, active: false } },
    });

    const result = await updateProfile('ep1', { active: false });
    expect(apiClient.patch).toHaveBeenCalledWith('/workforce/profiles/ep1', { active: false });
    expect(result.active).toBe(false);
  });

  it('deactivateProfile calls DELETE /workforce/profiles/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({
      data: { data: { ...mockProfile, active: false } },
    });

    const result = await deactivateProfile('ep1');
    expect(apiClient.delete).toHaveBeenCalledWith('/workforce/profiles/ep1');
    expect(result.active).toBe(false);
  });
});
