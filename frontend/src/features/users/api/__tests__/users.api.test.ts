import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchUsers,
  fetchUser,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
} from '../users.api';

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

const mockUser = {
  id: 'u1',
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  phone: null,
  branchId: null,
  roleId: null,
};

describe('users.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchUsers calls GET /users', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        data: [mockUser],
        meta: { timestamp: '', total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    });

    const result = await fetchUsers({ page: 1, limit: 20 });

    expect(apiClient.get).toHaveBeenCalledWith('/users', {
      params: { page: 1, limit: 20 },
    });
    expect(result.items).toHaveLength(1);
  });

  it('fetchUser calls GET /users/:id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockUser },
    });

    const result = await fetchUser('u1');

    expect(apiClient.get).toHaveBeenCalledWith('/users/u1');
    expect(result.email).toBe('user@example.com');
  });

  it('createUser calls POST /users with idempotency key', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { data: mockUser },
    });

    const payload = {
      email: 'user@example.com',
      password: 'pass123',
      firstName: 'John',
      lastName: 'Doe',
    };
    await createUser(payload);

    expect(withIdempotencyKey).toHaveBeenCalled();
    expect(apiClient.post).toHaveBeenCalledWith(
      '/users',
      payload,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('updateUser calls PATCH /users/:id', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: { ...mockUser, firstName: 'Jane' } },
    });

    const result = await updateUser('u1', { firstName: 'Jane' });

    expect(apiClient.patch).toHaveBeenCalledWith('/users/u1', { firstName: 'Jane' });
    expect(result.firstName).toBe('Jane');
  });

  it('deleteUser calls DELETE /users/:id', async () => {
    vi.mocked(apiClient.delete).mockResolvedValue({});

    await deleteUser('u1');

    expect(apiClient.delete).toHaveBeenCalledWith('/users/u1');
  });

  it('restoreUser calls PATCH /users/:id/restore', async () => {
    vi.mocked(apiClient.patch).mockResolvedValue({
      data: { data: mockUser },
    });

    const result = await restoreUser('u1');

    expect(apiClient.patch).toHaveBeenCalledWith('/users/u1/restore');
    expect(result.id).toBe('u1');
  });
});
