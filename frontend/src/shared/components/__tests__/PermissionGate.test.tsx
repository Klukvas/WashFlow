import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PermissionGate } from '../PermissionGate';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { AuthUser } from '@/shared/types/auth';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'HS256' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

const regularUser: AuthUser = {
  id: '1',
  email: 'user@example.com',
  firstName: 'Regular',
  lastName: 'User',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: false,
};

const superAdmin: AuthUser = {
  id: '2',
  email: 'admin@example.com',
  firstName: 'Super',
  lastName: 'Admin',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: true,
};

function setAuthState(user: AuthUser, permissions: string[]) {
  const token = makeJwt({ permissions });
  useAuthStore.setState({
    accessToken: token,
    refreshToken: 'rt',
    user,
    permissions,
    isAuthenticated: true,
  });
}

describe('PermissionGate', () => {
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

  it('renders children when single permission is granted', () => {
    setAuthState(regularUser, ['orders.read']);

    render(
      <PermissionGate permission="orders.read">
        <span>Allowed</span>
      </PermissionGate>,
    );

    expect(screen.getByText('Allowed')).toBeInTheDocument();
  });

  it('hides children when single permission is missing', () => {
    setAuthState(regularUser, ['orders.read']);

    render(
      <PermissionGate permission="orders.delete">
        <span>Secret</span>
      </PermissionGate>,
    );

    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders fallback when permission is missing', () => {
    setAuthState(regularUser, []);

    render(
      <PermissionGate
        permission="orders.read"
        fallback={<span>No access</span>}
      >
        <span>Allowed</span>
      </PermissionGate>,
    );

    expect(screen.queryByText('Allowed')).not.toBeInTheDocument();
    expect(screen.getByText('No access')).toBeInTheDocument();
  });

  it('renders children when any of multiple permissions match', () => {
    setAuthState(regularUser, ['orders.read']);

    render(
      <PermissionGate permissions={['orders.read', 'orders.create']}>
        <span>Visible</span>
      </PermissionGate>,
    );

    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('hides children when requireAll and not all permissions match', () => {
    setAuthState(regularUser, ['orders.read']);

    render(
      <PermissionGate permissions={['orders.read', 'orders.create']} requireAll>
        <span>Hidden</span>
      </PermissionGate>,
    );

    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('renders children when requireAll and all permissions match', () => {
    setAuthState(regularUser, ['orders.read', 'orders.create']);

    render(
      <PermissionGate permissions={['orders.read', 'orders.create']} requireAll>
        <span>Visible</span>
      </PermissionGate>,
    );

    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('super admin bypasses all permission checks', () => {
    setAuthState(superAdmin, []);

    render(
      <PermissionGate permission="anything.at.all">
        <span>Super access</span>
      </PermissionGate>,
    );

    expect(screen.getByText('Super access')).toBeInTheDocument();
  });

  it('renders children when no permission prop is provided', () => {
    setAuthState(regularUser, []);

    render(
      <PermissionGate>
        <span>Always visible</span>
      </PermissionGate>,
    );

    expect(screen.getByText('Always visible')).toBeInTheDocument();
  });
});
