import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  login,
  register,
  changePassword,
  resetUserPassword,
} from '../auth.api';

// Mock apiClient
vi.mock('@/shared/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

import { apiClient } from '@/shared/api/client';

const mockUser = {
  id: '1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: false,
};

describe('auth.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('calls POST /auth/login and returns data', async () => {
      const response = {
        data: { data: { accessToken: 'token-123', user: mockUser } },
      };
      vi.mocked(apiClient.post).mockResolvedValue(response);

      const result = await login({
        email: 'test@example.com',
        password: 'pass123',
      });

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'pass123',
      });
      expect(result.accessToken).toBe('token-123');
      expect(result.user).toEqual(mockUser);
    });
  });

  describe('register', () => {
    it('calls POST /auth/register and returns data', async () => {
      const response = {
        data: { data: { accessToken: 'new-token', user: mockUser } },
      };
      vi.mocked(apiClient.post).mockResolvedValue(response);

      const payload = {
        email: 'new@example.com',
        password: 'pass123',
        firstName: 'New',
        lastName: 'User',
        companyName: 'Test Co',
      };
      const result = await register(payload);

      expect(apiClient.post).toHaveBeenCalledWith('/auth/register', payload);
      expect(result.accessToken).toBe('new-token');
    });
  });

  describe('changePassword', () => {
    it('calls PATCH /auth/change-password', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });

      await changePassword({ currentPassword: 'old', newPassword: 'new123' });

      expect(apiClient.patch).toHaveBeenCalledWith('/auth/change-password', {
        currentPassword: 'old',
        newPassword: 'new123',
      });
    });
  });

  describe('resetUserPassword', () => {
    it('calls PATCH /users/:id/reset-password', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue({ data: {} });

      await resetUserPassword('user-1', 'new-pass');

      expect(apiClient.patch).toHaveBeenCalledWith(
        '/users/user-1/reset-password',
        {
          newPassword: 'new-pass',
        },
      );
    });
  });
});
