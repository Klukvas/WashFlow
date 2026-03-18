import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  login,
  register,
  changePassword,
  resetUserPassword,
  forgotPassword,
  resetPassword,
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

  describe('forgotPassword', () => {
    it('calls POST /auth/forgot-password with the email', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      await forgotPassword('user@example.com');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'user@example.com',
      });
    });

    it('returns undefined on success', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      const result = await forgotPassword('user@example.com');

      expect(result).toBeUndefined();
    });

    it('propagates errors thrown by the API client', async () => {
      const error = new Error('Network error');
      vi.mocked(apiClient.post).mockRejectedValueOnce(error);

      await expect(forgotPassword('user@example.com')).rejects.toThrow(
        'Network error',
      );
    });

    it('calls POST with the exact email address provided', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      await forgotPassword('another+user@sub.domain.io');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', {
        email: 'another+user@sub.domain.io',
      });
    });
  });

  describe('resetPassword', () => {
    it('calls POST /auth/reset-password with token and newPassword', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      await resetPassword('reset-token-xyz', 'newSecurePass1');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'reset-token-xyz',
        newPassword: 'newSecurePass1',
      });
    });

    it('returns undefined on success', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      const result = await resetPassword('token-abc', 'mypassword');

      expect(result).toBeUndefined();
    });

    it('propagates errors thrown by the API client', async () => {
      const error = new Error('Token expired');
      vi.mocked(apiClient.post).mockRejectedValueOnce(error);

      await expect(resetPassword('bad-token', 'pass')).rejects.toThrow(
        'Token expired',
      );
    });

    it('passes the exact token received to the API', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({ data: {} });

      await resetPassword('eyJhbGciOiJIUzI1NiJ9.payload.sig', 'pass123456');

      expect(apiClient.post).toHaveBeenCalledWith('/auth/reset-password', {
        token: 'eyJhbGciOiJIUzI1NiJ9.payload.sig',
        newPassword: 'pass123456',
      });
    });
  });
});
