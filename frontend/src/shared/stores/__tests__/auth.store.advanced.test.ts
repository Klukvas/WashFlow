import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { useAuthStore, getAccessToken, decodeJwtPayload } from '../auth.store';
import type { AuthUser } from '@/shared/types/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

const mockUser: AuthUser = {
  id: '1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: false,
};

describe('decodeJwtPayload', () => {
  it('decodes a valid JWT payload', () => {
    const token = makeJwt({ permissions: ['orders.read'], isSuperAdmin: true });
    const payload = decodeJwtPayload(token);

    expect(payload).toEqual({
      permissions: ['orders.read'],
      isSuperAdmin: true,
    });
  });

  it('returns null for a completely invalid token', () => {
    const payload = decodeJwtPayload('not-a-jwt');
    expect(payload).toBeNull();
  });

  it('returns null for an empty string', () => {
    const payload = decodeJwtPayload('');
    expect(payload).toBeNull();
  });

  it('handles token with empty payload', () => {
    const token = makeJwt({});
    const payload = decodeJwtPayload(token);
    expect(payload).toEqual({});
  });

  it('preserves all fields in the payload', () => {
    const token = makeJwt({
      sub: 'user-1',
      tenantId: 'tenant-1',
      permissions: ['a', 'b'],
      isSuperAdmin: false,
      type: 'access',
    });
    const payload = decodeJwtPayload(token);

    expect(payload).toEqual({
      sub: 'user-1',
      tenantId: 'tenant-1',
      permissions: ['a', 'b'],
      isSuperAdmin: false,
      type: 'access',
    });
  });
});

describe('auth.store bootRefresh', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call refresh if there is already an accessToken', async () => {
    const token = makeJwt({ permissions: ['orders.read'] });
    useAuthStore.getState().setAuth(token, mockUser);

    const postSpy = vi.spyOn(axios, 'post');
    await useAuthStore.getState().bootRefresh();

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('does not call refresh if there is no stored user (no initial session)', async () => {
    // Ensure no user in localStorage and no accessToken
    localStorage.removeItem('user');

    const postSpy = vi.spyOn(axios, 'post');
    await useAuthStore.getState().bootRefresh();

    expect(postSpy).not.toHaveBeenCalled();
  });

  it('sets token, user, and permissions on successful refresh', async () => {
    // Pre-populate localStorage so _initialUser is set when module re-loads
    localStorage.setItem('user', JSON.stringify(mockUser));

    const refreshedUser: AuthUser = {
      ...mockUser,
      firstName: 'Refreshed',
    };
    const refreshToken = makeJwt({
      permissions: ['orders.read', 'orders.write'],
    });

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({
      data: {
        data: { accessToken: refreshToken, user: refreshedUser },
      },
    });

    // Reset module registry and re-import so _initialUser picks up localStorage
    vi.resetModules();
    const { useAuthStore: freshStore, getAccessToken: freshGetToken } =
      await import('../auth.store');

    await freshStore.getState().bootRefresh();

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/auth/refresh',
      {},
      { withCredentials: true },
    );

    const state = freshStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user).toEqual(refreshedUser);
    expect(state.permissions).toEqual(['orders.read', 'orders.write']);
    expect(freshGetToken()).toBe(refreshToken);
    expect(localStorage.getItem('user')).toBe(JSON.stringify(refreshedUser));
  });

  it('clears auth state when refresh fails', async () => {
    // Pre-populate localStorage so _initialUser is set when module re-loads
    localStorage.setItem('user', JSON.stringify(mockUser));

    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Token expired'));

    vi.resetModules();
    const { useAuthStore: freshStore, getAccessToken: freshGetToken } =
      await import('../auth.store');

    await freshStore.getState().bootRefresh();

    const state = freshStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.permissions).toEqual([]);
    expect(freshGetToken()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('auth.store logout', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /api/v1/auth/logout with credentials and clears state', async () => {
    const token = makeJwt({ permissions: ['orders.read'] });
    useAuthStore.getState().setAuth(token, mockUser);

    const postSpy = vi.spyOn(axios, 'post').mockResolvedValue({});

    await useAuthStore.getState().logout();

    expect(postSpy).toHaveBeenCalledWith(
      '/api/v1/auth/logout',
      {},
      expect.objectContaining({
        withCredentials: true,
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      }),
    );

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.permissions).toEqual([]);
    expect(getAccessToken()).toBeNull();
  });

  it('clears state even if logout API call fails', async () => {
    const token = makeJwt({ permissions: ['orders.read'] });
    useAuthStore.getState().setAuth(token, mockUser);

    vi.spyOn(axios, 'post').mockRejectedValue(new Error('Network error'));

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(getAccessToken()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('removes user from localStorage', async () => {
    const token = makeJwt({ permissions: [] });
    useAuthStore.getState().setAuth(token, mockUser);

    expect(localStorage.getItem('user')).not.toBeNull();

    vi.spyOn(axios, 'post').mockResolvedValue({});
    await useAuthStore.getState().logout();

    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('auth.store user restore from localStorage', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('restores user and marks isAuthenticated when valid user exists in localStorage', async () => {
    localStorage.setItem('user', JSON.stringify(mockUser));

    vi.resetModules();
    const { useAuthStore: freshStore } = await import('../auth.store');

    const state = freshStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it('rejects and clears localStorage when stored user is missing required fields', async () => {
    // Missing tenantId — should fail isValidAuthUser check
    localStorage.setItem(
      'user',
      JSON.stringify({ id: '1', email: 'test@example.com' }),
    );

    vi.resetModules();
    const { useAuthStore: freshStore } = await import('../auth.store');

    const state = freshStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('handles corrupted JSON in localStorage gracefully', async () => {
    localStorage.setItem('user', 'not-valid-json{{{');

    vi.resetModules();
    const { useAuthStore: freshStore } = await import('../auth.store');

    const state = freshStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('decodeJwtPayload returns isSuperAdmin when present', () => {
    const adminToken = makeJwt({ isSuperAdmin: true, permissions: [] });
    const payload = decodeJwtPayload(adminToken);
    expect(payload?.isSuperAdmin).toBe(true);
  });

  it('decodeJwtPayload defaults isSuperAdmin to undefined when absent', () => {
    const regularToken = makeJwt({ permissions: ['orders.read'] });
    const payload = decodeJwtPayload(regularToken);
    expect(payload?.isSuperAdmin).toBeUndefined();
  });
});
