import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
} from 'axios';
import * as Sentry from '@sentry/react';
import { useAuthStore, getAccessToken } from '@/shared/stores/auth.store';
import type {
  ApiError,
  PaginatedApiResponse,
  PaginatedResponse,
} from '@/shared/types/api';

export const apiClient = axios.create({
  baseURL: '/api/v1',
  withCredentials: true, // send the HttpOnly refresh_token cookie automatically
  headers: {
    'Content-Type': 'application/json',
  },
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  failedQueue = [];
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    // Skip token refresh for auth endpoints — login/register 401s should
    // propagate directly so the UI can show the error message.
    const isAuthEndpoint = /\/auth\/(login|register)$/.test(
      originalRequest.url ?? '',
    );

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers = {
                ...originalRequest.headers,
                Authorization: `Bearer ${token}`,
              };
              resolve(apiClient(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // The refresh token is sent automatically as an HttpOnly cookie.
        // No need to read it from the store or send it in the request body.
        const { data } = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );

        const { accessToken: newAccessToken, user } = data.data;
        useAuthStore.getState().setAuth(newAccessToken, user);

        processQueue(null, newAccessToken);

        originalRequest.headers = {
          ...originalRequest.headers,
          Authorization: `Bearer ${newAccessToken}`,
        };
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        await useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    if (error.response && error.response.status >= 500) {
      Sentry.captureException(error, {
        contexts: {
          api: {
            url: error.config?.url,
            method: error.config?.method,
            status: error.response.status,
          },
        },
      });
    }

    return Promise.reject(error);
  },
);

export function withIdempotencyKey(
  config?: AxiosRequestConfig,
): AxiosRequestConfig {
  return {
    ...config,
    headers: {
      ...config?.headers,
      'idempotency-key': crypto.randomUUID(),
    },
  };
}

/** Convert the flat backend paginated response into the frontend PaginatedResponse shape. */
export function toPaginated<T>(
  resp: PaginatedApiResponse<T>,
): PaginatedResponse<T> {
  return {
    items: resp.data,
    meta: {
      total: resp.meta.total,
      page: resp.meta.page,
      limit: resp.meta.limit,
      totalPages: resp.meta.totalPages,
    },
  };
}
