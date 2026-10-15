import axios, {
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  CanceledError,
} from 'axios';
import * as Sentry from '@sentry/react';
import {
  useAuthStore,
  getAccessToken,
  getAuthSessionVersion,
  runAuthCookieRequest,
  acquireAuthCookieLease,
  beginAuthTransition,
  finishAuthTransition,
  isAuthTransitionPending,
  applyAuthCookieResponse,
} from '@/shared/stores/auth.store';
import { router } from '@/app/router';
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

type SessionRequestConfig = AxiosRequestConfig & {
  _retry?: boolean;
  _authSessionVersion?: number;
  _authCookieLease?: () => void;
  _authTransitionVersion?: number;
};

let activeRefresh: { version: number; promise: Promise<string> } | null = null;

function refreshAccessToken(version: number): Promise<string> {
  if (activeRefresh?.version === version) return activeRefresh.promise;

  const promise = (async () => {
    try {
      return await runAuthCookieRequest(async () => {
        if (version !== getAuthSessionVersion() || isAuthTransitionPending())
          throw new CanceledError('Session changed');
        const { data } = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        applyAuthCookieResponse(data.data, version);
        return data.data.accessToken as string;
      });
    } catch (error) {
      // A failed refresh from the previous account must not log out its successor.
      if (version === getAuthSessionVersion()) {
        const logout = useAuthStore.getState().logout();
        const loggedOutVersion = getAuthSessionVersion();
        await logout;
        if (loggedOutVersion === getAuthSessionVersion()) {
          router.navigate('/login', { replace: true });
        }
      }
      throw error;
    }
  })().finally(() => {
    if (activeRefresh?.promise === promise) activeRefresh = null;
  });
  activeRefresh = { version, promise };
  return promise;
}

apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    const sessionConfig = config as InternalAxiosRequestConfig &
      SessionRequestConfig;
    if (/\/auth\/(login|register)$/.test(config.url ?? '')) {
      const version = beginAuthTransition();
      sessionConfig._authTransitionVersion = version;
      sessionConfig._authSessionVersion = version;
      const release = await acquireAuthCookieLease();
      sessionConfig._authCookieLease = release;
      if (version !== getAuthSessionVersion()) {
        releaseAuthCookieLease(sessionConfig);
        throw new CanceledError('Session changed');
      }
    } else if (isAuthTransitionPending()) {
      throw new CanceledError('Session changed');
    }
    sessionConfig._authSessionVersion ??= getAuthSessionVersion();
    if (sessionConfig._authSessionVersion !== getAuthSessionVersion()) {
      throw new CanceledError('Session changed');
    }
    const accessToken = getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => {
    const config = response.config as SessionRequestConfig | undefined;
    if (config?._authTransitionVersion !== undefined) {
      try {
        applyAuthCookieResponse(
          response.data.data,
          config._authTransitionVersion,
        );
        config._authSessionVersion = getAuthSessionVersion();
      } finally {
        releaseAuthCookieLease(config);
      }
    }
    const version = (response.config as SessionRequestConfig | undefined)
      ?._authSessionVersion;
    if (version !== undefined && version !== getAuthSessionVersion()) {
      throw new CanceledError('Session changed');
    }
    return response;
  },
  async (error: AxiosError<ApiError>) => {
    const originalRequest = error.config as SessionRequestConfig | undefined;
    if (!originalRequest) return Promise.reject(error);
    const transitionVersion = originalRequest._authTransitionVersion;
    releaseAuthCookieLease(originalRequest);
    if (
      transitionVersion !== undefined &&
      transitionVersion === getAuthSessionVersion()
    ) {
      // Release first: logout uses the same queue and must never await its own lease.
      const logout = useAuthStore.getState().logout();
      originalRequest._authSessionVersion = getAuthSessionVersion();
      await logout;
    }
    const version =
      originalRequest._authSessionVersion ?? getAuthSessionVersion();
    if (version !== getAuthSessionVersion()) {
      return Promise.reject(new CanceledError('Session changed'));
    }

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
      originalRequest._retry = true;
      const accessToken = await refreshAccessToken(version);
      if (version !== getAuthSessionVersion()) {
        throw new CanceledError('Session changed');
      }
      originalRequest.headers = {
        ...originalRequest.headers,
        Authorization: `Bearer ${accessToken}`,
      };
      return apiClient(originalRequest);
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

    // Extract the backend error message so callers get a human-readable string
    // instead of the generic axios "Request failed with status code 4xx".
    const serverMessage = error.response?.data?.message;
    if (serverMessage) {
      error.message = Array.isArray(serverMessage)
        ? serverMessage.join('. ')
        : serverMessage;
    }

    return Promise.reject(error);
  },
);

function releaseAuthCookieLease(config: SessionRequestConfig): void {
  if (config._authTransitionVersion !== undefined)
    finishAuthTransition(config._authTransitionVersion);
  config._authCookieLease?.();
  config._authCookieLease = undefined;
}

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
