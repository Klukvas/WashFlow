import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchServices,
  fetchService,
  createService,
  updateService,
  deleteService,
  restoreService,
} from '../services.api';

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

const mockService = {
  id: 's1',
  name: 'Basic Wash',
  description: 'Simple wash',
  durationMin: 30,
  price: 150,
  isActive: true,
  sortOrder: 1,
};

describe('services.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchServices calls GET /services', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockService],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchServices({ page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/services', {
      params: { page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchService calls GET /services/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockService },
    });

    const result = await fetchService('s1');

    expect(apiClient.get).toHaveBeenCalledWith('/services/s1');
    expect(result.name).toBe('Basic Wash');
  });

  it('createService calls POST /services', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockService },
    });

    const payload = { name: 'Basic Wash', durationMin: 30, price: 150 };
    const result = await createService(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/services', payload);
    expect(result.id).toBe('s1');
  });

  it('updateService calls PATCH /services/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockService, price: 200 } },
    });

    const result = await updateService('s1', { price: 200 });

    expect(apiClient.patch).toHaveBeenCalledWith('/services/s1', { price: 200 });
    expect(result.price).toBe(200);
  });

  it('deleteService calls DELETE /services/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    await deleteService('s1');

    expect(apiClient.delete).toHaveBeenCalledWith('/services/s1');
  });

  it('restoreService calls PATCH /services/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockService },
    });

    const result = await restoreService('s1');

    expect(apiClient.patch).toHaveBeenCalledWith('/services/s1/restore');
    expect(result.id).toBe('s1');
  });
});
