import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBranchScope } from '../useBranchScope';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { AuthUser } from '@/shared/types/auth';

const baseUser: AuthUser = {
  id: '1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: false,
};

describe('useBranchScope', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      accessToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  });

  it('returns null branchId when no user', () => {
    const { result } = renderHook(() => useBranchScope());
    expect(result.current.branchId).toBeNull();
    expect(result.current.isBranchScoped).toBe(false);
  });

  it('returns null branchId when user has no branch', () => {
    useAuthStore.setState({ user: baseUser, isAuthenticated: true });

    const { result } = renderHook(() => useBranchScope());
    expect(result.current.branchId).toBeNull();
    expect(result.current.isBranchScoped).toBe(false);
  });

  it('returns branchId when user is scoped to a branch', () => {
    useAuthStore.setState({
      user: { ...baseUser, branchId: 'branch-42' },
      isAuthenticated: true,
    });

    const { result } = renderHook(() => useBranchScope());
    expect(result.current.branchId).toBe('branch-42');
    expect(result.current.isBranchScoped).toBe(true);
  });
});
