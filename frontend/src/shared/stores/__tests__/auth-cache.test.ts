import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import type { AuthUser } from '@/shared/types/auth';

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
const token = (permissions = ['orders.read', 'payments.read']) =>
  `header.${btoa(JSON.stringify({ permissions }))}.signature`;

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

async function setup(storedUser?: AuthUser) {
  if (storedUser) localStorage.setItem('user', JSON.stringify(storedUser));
  const auth = await import('../auth.store');
  const { queryClient } = await import('@/shared/api/query-client');
  return { ...auth, queryClient };
}

describe('auth query cache isolation', () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    vi.spyOn(axios, 'post').mockResolvedValue({});
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['another tenant', userB],
    [
      'a lower-permission user in the same tenant',
      { ...userB, tenantId: userA.tenantId },
    ],
    ['the same user in another tenant', { ...userA, tenantId: userB.tenantId }],
  ])('refetches fresh keys after switching to %s', async (_name, nextUser) => {
    const { useAuthStore, queryClient } = await setup();
    useAuthStore.getState().setAuth(token(), userA);
    await queryClient.fetchQuery({
      queryKey: ['orders'],
      queryFn: async () => ['private-a'],
    });
    useAuthStore.getState().setAuth(token(['orders.read']), nextUser);
    expect(queryClient.getQueryData(['orders'])).toBeUndefined();
    const fetchB = vi.fn(async () => ['visible-b']);
    expect(
      await queryClient.fetchQuery({ queryKey: ['orders'], queryFn: fetchB }),
    ).toEqual(['visible-b']);
    expect(fetchB).toHaveBeenCalledOnce();
    queryClient.clear();
  });

  it('preserves fresh cache during a token refresh for unchanged access', async () => {
    const { useAuthStore, queryClient } = await setup();
    useAuthStore.getState().setAuth(token(), userA);
    queryClient.setQueryData(['orders'], ['private-a']);
    useAuthStore.getState().setAuth(token(['payments.read', 'orders.read']), {
      ...userA,
      firstName: 'Updated',
    });
    expect(queryClient.getQueryData(['orders'])).toEqual(['private-a']);
    queryClient.clear();
  });

  it('clears privileged cache when the same user loses permissions', async () => {
    const { useAuthStore, queryClient } = await setup();
    useAuthStore.getState().setAuth(token(), userA);
    queryClient.setQueryData(['payments'], ['private-a']);
    useAuthStore.getState().setAuth(token(['orders.read']), userA);
    expect(queryClient.getQueryData(['payments'])).toBeUndefined();
    queryClient.clear();
  });

  it('clears state and cache before logout network completes, without erasing a later login', async () => {
    const { useAuthStore, queryClient, getAccessToken } = await setup();
    useAuthStore.getState().setAuth(token(), userA);
    queryClient.setQueryData(['orders'], ['private-a']);
    const pending = deferred<unknown>();
    vi.mocked(axios.post).mockReturnValue(pending.promise);
    const logout = useAuthStore.getState().logout();
    expect(queryClient.getQueryData(['orders'])).toBeUndefined();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(getAccessToken()).toBeNull();
    useAuthStore.getState().setAuth(token(['orders.read']), userB);
    queryClient.setQueryData(['orders'], ['visible-b']);
    pending.resolve({});
    await logout;
    expect(useAuthStore.getState().user).toEqual(userB);
    expect(queryClient.getQueryData(['orders'])).toEqual(['visible-b']);
    queryClient.clear();
  });

  it('cancels an old query even if its network promise resolves after the next login', async () => {
    const { useAuthStore, queryClient } = await setup();
    useAuthStore.getState().setAuth(token(), userA);
    const pending = deferred<string[]>();
    const oldQuery = queryClient.fetchQuery({
      queryKey: ['orders'],
      queryFn: () => pending.promise,
    });
    const settled = oldQuery.catch(() => undefined);
    useAuthStore.getState().setAuth(token(['orders.read']), userB);
    expect(queryClient.getQueryData(['orders'])).toBeUndefined();
    const newQuery = queryClient.fetchQuery({
      queryKey: ['orders'],
      queryFn: async () => ['visible-b'],
    });
    pending.resolve(['private-a']);
    await settled;
    await newQuery;
    expect(queryClient.getQueryData(['orders'])).toEqual(['visible-b']);
    queryClient.clear();
  });

  it('clears cached data when boot refresh fails', async () => {
    const { useAuthStore, queryClient } = await setup(userA);
    queryClient.setQueryData(['orders'], ['private-a']);
    vi.mocked(axios.post).mockRejectedValue(new Error('Expired'));
    await useAuthStore.getState().bootRefresh();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(queryClient.getQueryData(['orders'])).toBeUndefined();
    queryClient.clear();
  });

  it('does not restore the account when boot refresh finishes after logout', async () => {
    const { useAuthStore, queryClient, getAccessToken } = await setup(userA);
    const pending = deferred<unknown>();
    vi.mocked(axios.post).mockReturnValueOnce(pending.promise);
    const refresh = useAuthStore.getState().bootRefresh();
    const logout = useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    pending.resolve({ data: { data: { accessToken: token(), user: userA } } });
    await Promise.all([refresh, logout]);
    expect(useAuthStore.getState().user).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    queryClient.clear();
  });

  it.each(['success', 'failure'])(
    'ignores late boot refresh %s after switching accounts',
    async (result) => {
      const { useAuthStore, queryClient } = await setup(userA);
      const pending = deferred<unknown>();
      vi.mocked(axios.post).mockReturnValue(pending.promise);
      const refresh = useAuthStore.getState().bootRefresh();
      useAuthStore.getState().setAuth(token(['orders.read']), userB);
      queryClient.setQueryData(['orders'], ['visible-b']);
      if (result === 'success')
        pending.resolve({
          data: { data: { accessToken: token(), user: userA } },
        });
      else pending.reject(new Error('Expired'));
      await refresh;
      expect(useAuthStore.getState().user).toEqual(userB);
      expect(queryClient.getQueryData(['orders'])).toEqual(['visible-b']);
      queryClient.clear();
    },
  );
});
