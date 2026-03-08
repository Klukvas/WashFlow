import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchRoles,
  fetchRole,
  createRole,
  updateRole,
  deleteRole,
  restoreRole,
  assignPermissions,
  fetchPermissions,
} from '../roles.api';

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

const mockRole = { id: 'r1', name: 'Admin', description: 'Full access' };

describe('roles.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchRoles calls GET /roles', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockRole],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchRoles({ page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/roles', {
      params: { page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchRole calls GET /roles/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockRole },
    });

    const result = await fetchRole('r1');
    expect(apiClient.get).toHaveBeenCalledWith('/roles/r1');
    expect(result.name).toBe('Admin');
  });

  it('createRole calls POST /roles', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockRole },
    });

    const result = await createRole({ name: 'Admin', description: 'Full access' });
    expect(apiClient.post).toHaveBeenCalledWith('/roles', { name: 'Admin', description: 'Full access' });
    expect(result.id).toBe('r1');
  });

  it('updateRole calls PATCH /roles/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockRole, name: 'Manager' } },
    });

    const result = await updateRole('r1', { name: 'Manager' });
    expect(apiClient.patch).toHaveBeenCalledWith('/roles/r1', { name: 'Manager' });
    expect(result.name).toBe('Manager');
  });

  it('deleteRole calls DELETE /roles/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});
    await deleteRole('r1');
    expect(apiClient.delete).toHaveBeenCalledWith('/roles/r1');
  });

  it('restoreRole calls PATCH /roles/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockRole },
    });

    const result = await restoreRole('r1');
    expect(apiClient.patch).toHaveBeenCalledWith('/roles/r1/restore');
    expect(result.id).toBe('r1');
  });

  it('assignPermissions calls POST /roles/:id/permissions', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockRole },
    });

    const result = await assignPermissions('r1', { permissionIds: ['p1', 'p2'] });
    expect(apiClient.post).toHaveBeenCalledWith('/roles/r1/permissions', { permissionIds: ['p1', 'p2'] });
    expect(result.id).toBe('r1');
  });

  it('fetchPermissions calls GET /permissions', async () => {
    const perms = [{ id: 'p1', name: 'orders.read', module: 'orders' }];
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: perms },
    });

    const result = await fetchPermissions();
    expect(apiClient.get).toHaveBeenCalledWith('/permissions');
    expect(result).toHaveLength(1);
  });
});
