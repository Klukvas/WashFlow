import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchClients,
  fetchClient,
  createClient,
  updateClient,
  deleteClient,
  restoreClient,
  mergeClients,
} from '../clients.api';

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

const mockClient = {
  id: 'c1',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+380991234567',
  email: 'john@example.com',
  notes: null,
};

describe('clients.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchClients calls GET /clients with params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockClient],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchClients({ page: 1, limit: 20, search: 'John' });

    expect(apiClient.get).toHaveBeenCalledWith('/clients', {
      params: { page: 1, limit: 20, search: 'John' },
    });
    expect(result.items).toHaveLength(1);
    expect(result.meta.total).toBe(1);
  });

  it('fetchClient calls GET /clients/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockClient },
    });

    const result = await fetchClient('c1');

    expect(apiClient.get).toHaveBeenCalledWith('/clients/c1');
    expect(result).toEqual(mockClient);
  });

  it('createClient calls POST /clients', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockClient },
    });

    const result = await createClient({ firstName: 'John' });

    expect(apiClient.post).toHaveBeenCalledWith('/clients', { firstName: 'John' });
    expect(result.id).toBe('c1');
  });

  it('updateClient calls PATCH /clients/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockClient, firstName: 'Jane' } },
    });

    const result = await updateClient('c1', { firstName: 'Jane' });

    expect(apiClient.patch).toHaveBeenCalledWith('/clients/c1', { firstName: 'Jane' });
    expect(result.firstName).toBe('Jane');
  });

  it('deleteClient calls DELETE /clients/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    await deleteClient('c1');

    expect(apiClient.delete).toHaveBeenCalledWith('/clients/c1');
  });

  it('restoreClient calls PATCH /clients/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockClient },
    });

    const result = await restoreClient('c1');

    expect(apiClient.patch).toHaveBeenCalledWith('/clients/c1/restore');
    expect(result.id).toBe('c1');
  });

  it('mergeClients calls POST /clients/merge', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockClient },
    });

    const payload = {
      sourceClientId: 'c2',
      targetClientId: 'c1',
      fieldOverrides: { firstName: 'John' },
    };

    const result = await mergeClients(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/clients/merge', payload);
    expect(result.id).toBe('c1');
  });
});
