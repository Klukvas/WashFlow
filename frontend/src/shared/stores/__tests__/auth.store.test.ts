import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '../auth.store';
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

describe('auth.store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  });

  it('starts unauthenticated', () => {
    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
    expect(state.accessToken).toBeNull();
  });

  it('setAuth stores tokens, user, and decodes permissions', () => {
    const token = makeJwt({ permissions: ['orders.read', 'orders.create'] });
    useAuthStore.getState().setAuth(token, 'refresh-tok', mockUser);

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.accessToken).toBe(token);
    expect(state.refreshToken).toBe('refresh-tok');
    expect(state.user).toEqual(mockUser);
    expect(state.permissions).toEqual(['orders.read', 'orders.create']);
    expect(localStorage.getItem('refreshToken')).toBe('refresh-tok');
  });

  it('setAuth handles token without permissions gracefully', () => {
    const token = makeJwt({ sub: '1' });
    useAuthStore.getState().setAuth(token, 'refresh-tok', mockUser);

    const state = useAuthStore.getState();
    expect(state.permissions).toEqual([]);
    expect(state.isAuthenticated).toBe(true);
  });

  it('setAuth handles malformed token gracefully', () => {
    useAuthStore.getState().setAuth('bad-token', 'refresh-tok', mockUser);

    const state = useAuthStore.getState();
    expect(state.permissions).toEqual([]);
    expect(state.isAuthenticated).toBe(true);
  });

  it('logout clears state and localStorage', () => {
    const token = makeJwt({ permissions: ['orders.read'] });
    useAuthStore.getState().setAuth(token, 'refresh-tok', mockUser);
    useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.permissions).toEqual([]);
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('setPermissions updates permissions directly', () => {
    useAuthStore.getState().setPermissions(['admin.all']);
    expect(useAuthStore.getState().permissions).toEqual(['admin.all']);
  });
});
