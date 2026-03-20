import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePermissions } from '../usePermissions';
import * as authStoreModule from '@/shared/stores/auth.store';
import { useAuthStore } from '@/shared/stores/auth.store';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe('usePermissions', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(authStoreModule, 'getAccessToken').mockReturnValue(null);
    useAuthStore.setState({
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  });

  it('returns false for hasPermission when not authenticated', () => {
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('orders.read')).toBe(false);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it('hasPermission returns true when user has the permission', () => {
    const token = makeJwt({ permissions: ['orders.read', 'clients.read'] });
    vi.spyOn(authStoreModule, 'getAccessToken').mockReturnValue(token);
    useAuthStore.setState({
      permissions: ['orders.read', 'clients.read'],
      isAuthenticated: true,
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('orders.read')).toBe(true);
    expect(result.current.hasPermission('users.read')).toBe(false);
  });

  it('hasAnyPermission returns true when at least one matches', () => {
    const token = makeJwt({ permissions: ['orders.read'] });
    vi.spyOn(authStoreModule, 'getAccessToken').mockReturnValue(token);
    useAuthStore.setState({
      permissions: ['orders.read'],
      isAuthenticated: true,
    });

    const { result } = renderHook(() => usePermissions());
    expect(
      result.current.hasAnyPermission(['orders.read', 'users.read']),
    ).toBe(true);
    expect(
      result.current.hasAnyPermission(['users.read', 'clients.read']),
    ).toBe(false);
  });

  it('hasAllPermissions returns true only when all match', () => {
    const token = makeJwt({
      permissions: ['orders.read', 'clients.read'],
    });
    vi.spyOn(authStoreModule, 'getAccessToken').mockReturnValue(token);
    useAuthStore.setState({
      permissions: ['orders.read', 'clients.read'],
      isAuthenticated: true,
    });

    const { result } = renderHook(() => usePermissions());
    expect(
      result.current.hasAllPermissions(['orders.read', 'clients.read']),
    ).toBe(true);
    expect(
      result.current.hasAllPermissions(['orders.read', 'users.read']),
    ).toBe(false);
  });

  it('superAdmin has all permissions', () => {
    const token = makeJwt({ isSuperAdmin: true, permissions: [] });
    vi.spyOn(authStoreModule, 'getAccessToken').mockReturnValue(token);
    useAuthStore.setState({
      permissions: [],
      isAuthenticated: true,
    });

    const { result } = renderHook(() => usePermissions());
    expect(result.current.isSuperAdmin).toBe(true);
    expect(result.current.hasPermission('anything.whatever')).toBe(true);
    expect(result.current.hasAnyPermission(['x', 'y'])).toBe(true);
    expect(result.current.hasAllPermissions(['a', 'b', 'c'])).toBe(true);
  });
});
