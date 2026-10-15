import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from 'axios';
import type { AuthUser } from '@/shared/types/auth';

vi.mock('@/app/router', () => ({ router: { navigate: vi.fn() } }));

const userA: AuthUser = {
  id: 'admin-a',
  email: 'a@example.com',
  firstName: 'A',
  lastName: 'User',
  tenantId: 'tenant-a',
  branchId: null,
  isSuperAdmin: false,
};
const userB: AuthUser = { ...userA, id: 'operator-b', tenantId: 'tenant-b' };
const token = `header.${btoa(JSON.stringify({ permissions: ['orders.read'] }))}.signature`;
const defaultAdapter = axios.defaults.adapter;

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return {
    promise,
    resolve(value: T) {
      resolve?.(value);
    },
    reject(reason: unknown) {
      reject?.(reason);
    },
  };
}

function unauthorized(config: InternalAxiosRequestConfig) {
  return new AxiosError('Expired', 'ERR_BAD_REQUEST', config, undefined, {
    data: {},
    status: 401,
    statusText: 'Unauthorized',
    headers: new AxiosHeaders(),
    config,
  });
}

async function setup() {
  const auth = await import('@/shared/stores/auth.store');
  const { apiClient } = await import('../client');
  const { queryClient } = await import('../query-client');
  const { router } = await import('@/app/router');
  auth.useAuthStore.getState().setAuth(token, userA);
  return { ...auth, apiClient, queryClient, router };
}

describe('API requests across session changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    localStorage.clear();
  });
  afterEach(() => {
    axios.defaults.adapter = defaultAdapter;
    vi.restoreAllMocks();
  });

  it.each(['login', 'register'] as const)(
    'rejects a delayed old 401 during %s before it can overwrite the new cookie',
    async (method) => {
      const { apiClient, useAuthStore, queryClient } = await setup();
      const service = await import('@/features/auth/api/auth.api');
      const orders = deferred<void>();
      const authResponse = deferred<void>();
      const refreshResponse = deferred<void>();
      let cookieOwner = 'a';
      const sent: string[] = [];
      const adapter: AxiosAdapter = async (config) => {
        const url = config.url ?? '';
        sent.push(url);
        if (url === '/orders') {
          await orders.promise;
          throw unauthorized(config);
        }
        const isRefresh = url.endsWith('/auth/refresh');
        await (isRefresh ? refreshResponse.promise : authResponse.promise);
        cookieOwner = isRefresh ? 'a' : 'b';
        return {
          data: {
            data: { accessToken: token, user: isRefresh ? userA : userB },
          },
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
        };
      };
      axios.defaults.adapter = adapter;
      apiClient.defaults.adapter = adapter;
      const oldResult = apiClient
        .get('/orders')
        .catch((error: unknown) => error);
      await vi.waitFor(() => expect(sent).toContain('/orders'));
      const login = service[method]({
        email: 'b@example.test',
        password: 'synthetic',
      });
      await vi.waitFor(() => expect(sent).toContain(`/auth/${method}`));
      orders.resolve();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      authResponse.resolve();
      const result = await login;
      useAuthStore.getState().setAuth(result.accessToken, result.user);
      queryClient.setQueryData(['orders'], ['visible-b']);
      refreshResponse.resolve();
      expect(axios.isCancel(await oldResult)).toBe(true);
      expect(cookieOwner).toBe('b');
      expect(sent.filter((url) => url.endsWith('/auth/refresh'))).toEqual([]);
      expect(useAuthStore.getState().user).toEqual(userB);
      expect(queryClient.getQueryData(['orders'])).toEqual(['visible-b']);
      queryClient.clear();
    },
  );

  it('serializes parallel auth attempts and accepts only the latest attempt', async () => {
    const { apiClient, useAuthStore } = await setup();
    const service = await import('@/features/auth/api/auth.api');
    const pending = deferred<void>();
    const sent: string[] = [];
    const userC = { ...userB, id: 'user-c', tenantId: 'tenant-c' };
    apiClient.defaults.adapter = async (config) => {
      sent.push(config.url ?? '');
      if (config.url === '/auth/login') await pending.promise;
      return {
        data: {
          data: {
            accessToken: token,
            user: config.url === '/auth/login' ? userB : userC,
          },
        },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const first = service
      .login({ email: 'b@example.test', password: 'synthetic' })
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(sent).toEqual(['/auth/login']));
    const latest = service.register({
      email: 'c@example.test',
      password: 'synthetic',
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(sent).toEqual(['/auth/login']);
    pending.resolve();
    expect(axios.isCancel(await first)).toBe(true);
    expect((await latest).user).toEqual(userC);
    expect(useAuthStore.getState().user).toEqual(userC);
    expect(sent).toEqual(['/auth/login', '/auth/register']);
  });

  it('orders logout after a pending login and authorizes it for the cookie owner', async () => {
    const { apiClient, useAuthStore, getAccessToken } = await setup();
    const pending = deferred<void>();
    const started = vi.fn();
    const tokenB = `header.${btoa(JSON.stringify({ sub: userB.id, permissions: ['orders.read'] }))}.signature`;
    apiClient.defaults.adapter = async (config) => {
      started();
      await pending.promise;
      return {
        data: { data: { accessToken: tokenB, user: userB } },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({});
    const attempt = apiClient
      .post('/auth/login', {})
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    const logout = useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(postSpy).not.toHaveBeenCalled();
    pending.resolve();
    expect(axios.isCancel(await attempt)).toBe(true);
    await logout;
    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      {},
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${tokenB}` }),
      }),
    );
    expect(useAuthStore.getState().user).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it.each(['401', 'network'])(
    'clears intentional state on login %s failure and releases the queue for another login',
    async (failure) => {
      const { apiClient, useAuthStore, queryClient, getAccessToken } =
        await setup();
      const service = await import('@/features/auth/api/auth.api');
      queryClient.setQueryData(['orders'], ['private-a']);
      const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({});
      let attempts = 0;
      apiClient.defaults.adapter = async (config) => {
        if (++attempts === 1) {
          if (failure === '401') throw unauthorized(config);
          throw new AxiosError(
            'Synthetic network failure',
            'ERR_NETWORK',
            config,
          );
        }
        return {
          data: { data: { accessToken: token, user: userB } },
          status: 200,
          statusText: 'OK',
          headers: new AxiosHeaders(),
          config,
        };
      };
      await expect(
        service.login({ email: 'b@example.test', password: 'synthetic' }),
      ).rejects.toThrow();
      expect(queryClient.getQueryData(['orders'])).toBeUndefined();
      expect(useAuthStore.getState().user).toBeNull();
      expect(getAccessToken()).toBeNull();
      expect(localStorage.getItem('user')).toBeNull();
      expect(postSpy).toHaveBeenCalledOnce();
      expect(
        (
          await service.login({
            email: 'b@example.test',
            password: 'synthetic',
          })
        ).user,
      ).toEqual(userB);
      expect(useAuthStore.getState().user).toEqual(userB);
    },
  );

  it('does not start boot or interceptor refresh while login owns the cookie', async () => {
    const { apiClient, useAuthStore } = await setup();
    const pending = deferred<void>();
    const started = vi.fn();
    apiClient.defaults.adapter = async (config) => {
      started();
      await pending.promise;
      return {
        data: { data: { accessToken: token, user: userB } },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const postSpy = vi.spyOn(axios, 'post');
    const login = apiClient.post('/auth/login', {});
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    await useAuthStore.getState().bootRefresh();
    await expect(apiClient.get('/orders')).rejects.toSatisfy(axios.isCancel);
    expect(postSpy).not.toHaveBeenCalled();
    pending.resolve();
    await login;
    expect(useAuthStore.getState().user).toEqual(userB);
  });

  it('ignores an already-returned auth result applied by a delayed caller after logout', async () => {
    const { apiClient, useAuthStore } = await setup();
    const service = await import('@/features/auth/api/auth.api');
    apiClient.defaults.adapter = async (config) => ({
      data: { data: { accessToken: token, user: userB } },
      status: 200,
      statusText: 'OK',
      headers: new AxiosHeaders(),
      config,
    });
    vi.spyOn(axios, 'post').mockResolvedValue({});
    const result = await service.login({
      email: 'b@example.test',
      password: 'synthetic',
    });
    await useAuthStore.getState().logout();
    useAuthStore.getState().setAuth(result.accessToken, result.user);
    expect(useAuthStore.getState().user).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it.each(['/auth/login', '/auth/register'])(
    'sends %s after the logout cookie response',
    async (url) => {
      const { apiClient, useAuthStore } = await setup();
      const pending = deferred<unknown>();
      vi.spyOn(axios, 'post').mockReturnValue(pending.promise);
      const logout = useAuthStore.getState().logout();
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
        data: { data: { accessToken: token, user: userB } },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }));
      apiClient.defaults.adapter = adapter;
      const login = apiClient.post(url, {
        email: 'b@example.test',
        password: 'synthetic',
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(adapter).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      pending.resolve({});
      await logout;
      const response = await login;
      useAuthStore
        .getState()
        .setAuth(response.data.data.accessToken, response.data.data.user);
      expect(adapter).toHaveBeenCalledOnce();
      expect(useAuthStore.getState().user).toEqual(userB);
    },
  );

  it.each(['refresh-first', 'logout-first'])(
    'waits for boot refresh and logout cookie responses: %s',
    async (order) => {
      localStorage.setItem('user', JSON.stringify(userA));
      const { useAuthStore } = await import('@/shared/stores/auth.store');
      const { apiClient } = await import('../client');
      const pendingRefresh = deferred<unknown>();
      const pendingLogout = deferred<unknown>();
      vi.spyOn(axios, 'post')
        .mockReturnValueOnce(pendingRefresh.promise)
        .mockReturnValueOnce(pendingLogout.promise);
      const refresh = useAuthStore.getState().bootRefresh();
      const logout = useAuthStore.getState().logout();
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
        data: { data: { accessToken: token, user: userB } },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      }));
      apiClient.defaults.adapter = adapter;
      const login = apiClient.post('/auth/login', {});
      if (order === 'refresh-first')
        pendingRefresh.resolve({
          data: { data: { accessToken: token, user: userA } },
        });
      else pendingLogout.resolve({});
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(adapter).not.toHaveBeenCalled();
      pendingRefresh.resolve({
        data: { data: { accessToken: token, user: userA } },
      });
      pendingLogout.resolve({});
      await Promise.all([refresh, logout, login]);
      expect(adapter).toHaveBeenCalledOnce();
      expect(useAuthStore.getState().user).toEqual(userB);
    },
  );

  it.each(['success', 'failure'])(
    'ignores old refresh %s after another account signs in',
    async (outcome) => {
      const { apiClient, useAuthStore, queryClient, router } = await setup();
      const pending = deferred<unknown>();
      const refreshSpy = vi
        .spyOn(axios, 'post')
        .mockReturnValue(pending.promise);
      apiClient.defaults.adapter = async (config) => {
        throw unauthorized(config);
      };
      const oldRequest = apiClient.get('/orders');
      const rejected = expect(oldRequest).rejects.toThrow();
      await vi.waitFor(() => expect(refreshSpy).toHaveBeenCalledOnce());
      useAuthStore.getState().setAuth(token, userB);
      queryClient.setQueryData(['orders'], ['visible-b']);
      if (outcome === 'success')
        pending.resolve({
          data: { data: { accessToken: token, user: userA } },
        });
      else pending.reject(new Error('Expired A'));
      await rejected;
      expect(useAuthStore.getState().user).toEqual(userB);
      expect(queryClient.getQueryData(['orders'])).toEqual(['visible-b']);
      expect(refreshSpy).toHaveBeenCalledOnce();
      expect(router.navigate).not.toHaveBeenCalled();
      queryClient.clear();
    },
  );

  it('keeps refreshed data and shares a refresh within the same account', async () => {
    const { apiClient, queryClient } = await setup();
    queryClient.setQueryData(['payments'], ['private-a']);
    const pending = deferred<unknown>();
    const refreshSpy = vi.spyOn(axios, 'post').mockReturnValue(pending.promise);
    const attempts = new Map<string, number>();
    apiClient.defaults.adapter = async (config) => {
      const url = config.url ?? '';
      const attempt = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, attempt);
      if (attempt === 1) throw unauthorized(config);
      return {
        data: ['visible-a'],
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const requests = Promise.all([
      apiClient.get('/orders'),
      apiClient.get('/clients'),
    ]);
    await vi.waitFor(() => expect(attempts.size).toBe(2));
    expect(refreshSpy).toHaveBeenCalledOnce();
    pending.resolve({ data: { data: { accessToken: token, user: userA } } });
    expect(await requests).toHaveLength(2);
    expect(queryClient.getQueryData(['payments'])).toEqual(['private-a']);
    queryClient.clear();
  });

  it('keeps login behind an already-started logout caused by a failed interceptor refresh', async () => {
    const { apiClient } = await setup();
    const pendingRefresh = deferred<unknown>();
    const pendingLogout = deferred<unknown>();
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockReturnValueOnce(pendingRefresh.promise)
      .mockReturnValueOnce(pendingLogout.promise);
    const loginSent = vi.fn();
    apiClient.defaults.adapter = async (config) => {
      if (config.url !== '/auth/login') throw unauthorized(config);
      loginSent();
      return {
        data: { data: { accessToken: token, user: userB } },
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const rejected = expect(apiClient.get('/orders')).rejects.toThrow(
      'Expired',
    );
    await vi.waitFor(() => expect(postSpy).toHaveBeenCalledOnce());
    pendingRefresh.reject(new Error('Expired'));
    await vi.waitFor(() => expect(postSpy).toHaveBeenCalledTimes(2));
    const login = apiClient.post('/auth/login', {});
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(loginSent).not.toHaveBeenCalled();
    pendingLogout.resolve({});
    await Promise.all([rejected, login]);
    expect(loginSent).toHaveBeenCalledOnce();
  });

  it('does not refresh a late 401 from a previous account', async () => {
    const { apiClient, useAuthStore } = await setup();
    const pending = deferred<never>();
    let requestConfig: InternalAxiosRequestConfig | undefined;
    apiClient.defaults.adapter = (config) => {
      requestConfig = config;
      return pending.promise;
    };
    const refreshSpy = vi.spyOn(axios, 'post');
    const oldRequest = apiClient.get('/orders');
    const rejected = expect(oldRequest).rejects.toSatisfy(axios.isCancel);
    await vi.waitFor(() => expect(requestConfig).toBeDefined());
    useAuthStore.getState().setAuth(token, userB);
    if (!requestConfig) throw new Error('Request not started');
    pending.reject(unauthorized(requestConfig));
    await rejected;
    expect(refreshSpy).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toEqual(userB);
  });

  it('uses a separate refresh result for the new account after the old cookie writer settles', async () => {
    const { apiClient, useAuthStore, queryClient, router } = await setup();
    const pendingA = deferred<unknown>();
    const pendingB = deferred<unknown>();
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockReturnValueOnce(pendingA.promise)
      .mockReturnValueOnce(pendingB.promise);
    const attempts = new Map<string, number>();
    apiClient.defaults.adapter = async (config) => {
      const url = config.url ?? '';
      const count = (attempts.get(url) ?? 0) + 1;
      attempts.set(url, count);
      if (count === 1) throw unauthorized(config);
      return {
        data: ['visible-b'],
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const oldRejected = expect(apiClient.get('/old-orders')).rejects.toSatisfy(
      axios.isCancel,
    );
    await vi.waitFor(() => expect(postSpy).toHaveBeenCalledOnce());
    useAuthStore.getState().setAuth(token, userB);
    const current = apiClient.get('/current-orders');
    pendingA.resolve({ data: { data: { accessToken: token, user: userA } } });
    await oldRejected;
    await vi.waitFor(() => expect(postSpy).toHaveBeenCalledTimes(2));
    pendingB.resolve({ data: { data: { accessToken: token, user: userB } } });
    expect((await current).data).toEqual(['visible-b']);
    expect(useAuthStore.getState().user).toEqual(userB);
    expect(router.navigate).not.toHaveBeenCalled();
    queryClient.clear();
  });

  it('rejects a late successful response from the old account', async () => {
    const { apiClient, useAuthStore } = await setup();
    const pending = deferred<void>();
    const started = vi.fn();
    apiClient.defaults.adapter = async (config) => {
      started();
      await pending.promise;
      return {
        data: ['private-a'],
        status: 200,
        statusText: 'OK',
        headers: new AxiosHeaders(),
        config,
      };
    };
    const oldRequest = apiClient.get('/orders');
    const rejected = expect(oldRequest).rejects.toSatisfy(axios.isCancel);
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    useAuthStore.getState().setAuth(token, userB);
    pending.resolve();
    await rejected;
  });

  it('clears cached data immediately on refresh failure and does not redirect a later login', async () => {
    const { apiClient, useAuthStore, queryClient, router } = await setup();
    const logoutNetwork = deferred<unknown>();
    const postSpy = vi
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('Expired'))
      .mockReturnValueOnce(logoutNetwork.promise);
    apiClient.defaults.adapter = async (config) => {
      throw unauthorized(config);
    };
    queryClient.setQueryData(['orders'], ['private-a']);
    const rejected = expect(apiClient.get('/orders')).rejects.toThrow(
      'Expired',
    );
    await vi.waitFor(() => expect(postSpy).toHaveBeenCalledTimes(2));
    expect(queryClient.getQueryData(['orders'])).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    useAuthStore.getState().setAuth(token, userB);
    queryClient.setQueryData(['orders'], ['visible-b']);
    logoutNetwork.resolve({});
    await rejected;
    expect(useAuthStore.getState().user).toEqual(userB);
    expect(queryClient.getQueryData(['orders'])).toEqual(['visible-b']);
    expect(router.navigate).not.toHaveBeenCalled();
    queryClient.clear();
  });
});
