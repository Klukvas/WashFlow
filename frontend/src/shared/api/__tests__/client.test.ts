import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

// Mock auth store before importing client
const mockGetAccessToken = vi.fn<[], string | null>(() => null);
const mockGetState = vi.fn();
vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: { getState: () => mockGetState() },
  getAccessToken: () => mockGetAccessToken(),
}));

describe('client module', () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAccessToken.mockReturnValue(null);
    mockGetState.mockReturnValue({
      setAuth: vi.fn(),
      logout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('toPaginated', () => {
    it('converts PaginatedApiResponse to PaginatedResponse', async () => {
      const { toPaginated } = await import('../client');
      const apiResponse = {
        data: [{ id: '1' }, { id: '2' }],
        meta: {
          timestamp: '2026-01-01T00:00:00Z',
          total: 10,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      };

      const result = toPaginated(apiResponse);

      expect(result.items).toEqual([{ id: '1' }, { id: '2' }]);
      expect(result.meta).toEqual({
        total: 10,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('handles empty data array', async () => {
      const { toPaginated } = await import('../client');
      const apiResponse = {
        data: [],
        meta: {
          timestamp: '2026-01-01T00:00:00Z',
          total: 0,
          page: 1,
          limit: 20,
          totalPages: 0,
        },
      };

      const result = toPaginated(apiResponse);
      expect(result.items).toEqual([]);
      expect(result.meta.total).toBe(0);
    });
  });

  describe('withIdempotencyKey', () => {
    it('adds idempotency-key header', async () => {
      const { withIdempotencyKey } = await import('../client');
      const config = withIdempotencyKey();
      expect(config.headers).toHaveProperty('idempotency-key');
      expect(typeof config.headers!['idempotency-key']).toBe('string');
    });

    it('preserves existing config', async () => {
      const { withIdempotencyKey } = await import('../client');
      const config = withIdempotencyKey({
        timeout: 5000,
        headers: { 'X-Custom': 'value' },
      });

      expect(config.timeout).toBe(5000);
      expect(config.headers!['X-Custom']).toBe('value');
      expect(config.headers).toHaveProperty('idempotency-key');
    });

    it('generates unique keys each call', async () => {
      const { withIdempotencyKey } = await import('../client');
      const config1 = withIdempotencyKey();
      const config2 = withIdempotencyKey();
      expect(config1.headers!['idempotency-key']).not.toBe(
        config2.headers!['idempotency-key'],
      );
    });

    it('works without config argument', async () => {
      const { withIdempotencyKey } = await import('../client');
      const config = withIdempotencyKey();
      expect(config.headers).toHaveProperty('idempotency-key');
    });

    it('works with empty config', async () => {
      const { withIdempotencyKey } = await import('../client');
      const config = withIdempotencyKey({});
      expect(config.headers).toHaveProperty('idempotency-key');
    });
  });

  describe('apiClient configuration', () => {
    it('creates axios instance with correct baseURL', async () => {
      const { apiClient } = await import('../client');
      expect(apiClient.defaults.baseURL).toBe('/api/v1');
    });

    it('creates axios instance with withCredentials enabled', async () => {
      const { apiClient } = await import('../client');
      expect(apiClient.defaults.withCredentials).toBe(true);
    });

    it('sets Content-Type header to application/json', async () => {
      const { apiClient } = await import('../client');
      expect(apiClient.defaults.headers['Content-Type']).toBe(
        'application/json',
      );
    });
  });

  describe('request interceptor', () => {
    it('attaches Authorization header when accessToken exists', async () => {
      mockGetAccessToken.mockReturnValue('test-token-123');

      const { apiClient } = await import('../client');

      // Get the request interceptor
      const interceptors = (
        apiClient.interceptors.request as unknown as {
          handlers: {
            fulfilled: (
              config: InternalAxiosRequestConfig,
            ) => InternalAxiosRequestConfig;
            rejected: (error: unknown) => Promise<never>;
          }[];
        }
      ).handlers;
      const requestInterceptor = interceptors[interceptors.length - 1];

      const config = {
        headers: new axios.AxiosHeaders(),
      } as InternalAxiosRequestConfig;

      const result = requestInterceptor.fulfilled(config);
      expect(result.headers.Authorization).toBe('Bearer test-token-123');
    });

    it('does not attach Authorization header when no accessToken', async () => {
      mockGetAccessToken.mockReturnValue(null);

      const { apiClient } = await import('../client');

      const interceptors = (
        apiClient.interceptors.request as unknown as {
          handlers: {
            fulfilled: (
              config: InternalAxiosRequestConfig,
            ) => InternalAxiosRequestConfig;
            rejected: (error: unknown) => Promise<never>;
          }[];
        }
      ).handlers;
      const requestInterceptor = interceptors[interceptors.length - 1];

      const config = {
        headers: new axios.AxiosHeaders(),
      } as InternalAxiosRequestConfig;

      const result = requestInterceptor.fulfilled(config);
      expect(result.headers.Authorization).toBeUndefined();
    });

    it('rejects errors in request interceptor', async () => {
      const { apiClient } = await import('../client');

      const interceptors = (
        apiClient.interceptors.request as unknown as {
          handlers: {
            fulfilled: (
              config: InternalAxiosRequestConfig,
            ) => InternalAxiosRequestConfig;
            rejected: (error: unknown) => Promise<never>;
          }[];
        }
      ).handlers;
      const requestInterceptor = interceptors[interceptors.length - 1];

      const error = new Error('request error');
      await expect(requestInterceptor.rejected(error)).rejects.toThrow(
        'request error',
      );
    });
  });

  describe('response interceptor', () => {
    it('passes through successful responses', async () => {
      const { apiClient } = await import('../client');

      const interceptors = (
        apiClient.interceptors.response as unknown as {
          handlers: {
            fulfilled: (response: unknown) => unknown;
            rejected: (error: unknown) => Promise<never>;
          }[];
        }
      ).handlers;
      const responseInterceptor = interceptors[interceptors.length - 1];

      const response = { data: { success: true }, status: 200 };
      const result = responseInterceptor.fulfilled(response);
      expect(result).toEqual(response);
    });

    it('rejects non-401 errors without retry', async () => {
      const { apiClient } = await import('../client');

      const interceptors = (
        apiClient.interceptors.response as unknown as {
          handlers: {
            fulfilled: (response: unknown) => unknown;
            rejected: (error: unknown) => Promise<never>;
          }[];
        }
      ).handlers;
      const responseInterceptor = interceptors[interceptors.length - 1];

      const error = {
        response: { status: 500 },
        config: {},
      };

      await expect(responseInterceptor.rejected(error)).rejects.toEqual(error);
    });

    it('rejects already-retried 401 errors', async () => {
      const { apiClient } = await import('../client');

      const interceptors = (
        apiClient.interceptors.response as unknown as {
          handlers: {
            fulfilled: (response: unknown) => unknown;
            rejected: (error: unknown) => Promise<never>;
          }[];
        }
      ).handlers;
      const responseInterceptor = interceptors[interceptors.length - 1];

      const error = {
        response: { status: 401 },
        config: { _retry: true },
      };

      await expect(responseInterceptor.rejected(error)).rejects.toEqual(error);
    });
  });
});
