import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchVehicles,
  fetchVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  restoreVehicle,
} from '../vehicles.api';

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

const mockVehicle = {
  id: 'v1',
  clientId: 'c1',
  make: 'Toyota',
  model: 'Camry',
  licensePlate: 'AA1234BB',
  color: 'white',
  year: 2020,
};

describe('vehicles.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchVehicles calls GET /vehicles with params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockVehicle],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchVehicles({ clientId: 'c1', page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/vehicles', {
      params: { clientId: 'c1', page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchVehicle calls GET /vehicles/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockVehicle },
    });

    const result = await fetchVehicle('v1');

    expect(apiClient.get).toHaveBeenCalledWith('/vehicles/v1');
    expect(result.make).toBe('Toyota');
  });

  it('createVehicle calls POST /vehicles', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockVehicle },
    });

    const result = await createVehicle({
      clientId: 'c1',
      make: 'Toyota',
      model: 'Camry',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/vehicles', {
      clientId: 'c1',
      make: 'Toyota',
      model: 'Camry',
    });
    expect(result.id).toBe('v1');
  });

  it('updateVehicle calls PATCH /vehicles/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockVehicle, color: 'black' } },
    });

    const result = await updateVehicle('v1', { color: 'black' });

    expect(apiClient.patch).toHaveBeenCalledWith('/vehicles/v1', { color: 'black' });
    expect(result.color).toBe('black');
  });

  it('deleteVehicle calls DELETE /vehicles/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    await deleteVehicle('v1');

    expect(apiClient.delete).toHaveBeenCalledWith('/vehicles/v1');
  });

  it('restoreVehicle calls PATCH /vehicles/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockVehicle },
    });

    const result = await restoreVehicle('v1');

    expect(apiClient.patch).toHaveBeenCalledWith('/vehicles/v1/restore');
    expect(result.id).toBe('v1');
  });
});
