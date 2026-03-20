import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { SubscriptionGate } from '../SubscriptionGate';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { SubscriptionStatus } from '@/features/subscription/api/subscription.api';

// Mock useSubscriptionStatus
const mockUseSubscriptionStatus = vi.fn();
vi.mock('@/features/subscription/hooks/useSubscription', () => ({
  useSubscriptionStatus: () => mockUseSubscriptionStatus(),
}));

function renderGate(initialPath = '/dashboard') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<SubscriptionGate />}>
          <Route path="/dashboard" element={<div>Dashboard Content</div>} />
          <Route path="/orders" element={<div>Orders Content</div>} />
          <Route
            path="/subscription"
            element={<div>Subscription Content</div>}
          />
          <Route
            path="/subscription/plans"
            element={<div>Plans Content</div>}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const expiredTrial: SubscriptionStatus = {
  isTrial: true,
  trialEndsAt: '2020-01-01T00:00:00Z',
};

const activeTrial: SubscriptionStatus = {
  isTrial: true,
  trialEndsAt: '2099-12-31T23:59:59Z',
};

const paidSubscription: SubscriptionStatus = {
  isTrial: false,
  trialEndsAt: null,
};

function setUser(
  overrides: { isSuperAdmin?: boolean; permissions?: string[] } = {},
) {
  useAuthStore.setState({
    user: {
      id: '1',
      email: 'user@test.com',
      firstName: 'Test',
      lastName: 'User',
      tenantId: 'tenant-1',
      branchId: null,
      isSuperAdmin: overrides.isSuperAdmin ?? false,
    },
    permissions: overrides.permissions ?? [],
    isAuthenticated: true,
  });
}

function setExpiredTrial() {
  mockUseSubscriptionStatus.mockReturnValue({
    data: expiredTrial,
    isLoading: false,
    isError: false,
  });
}

describe('SubscriptionGate', () => {
  beforeEach(() => {
    localStorage.clear();
    setUser();
    mockUseSubscriptionStatus.mockReset();
  });

  it('shows skeleton while loading', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderGate();

    expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
  });

  it('passes through on API error', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderGate();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('passes through when no data returned', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    });

    renderGate();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('passes through for active trial', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      data: activeTrial,
      isLoading: false,
      isError: false,
    });

    renderGate();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('passes through for paid subscription', () => {
    mockUseSubscriptionStatus.mockReturnValue({
      data: paidSubscription,
      isLoading: false,
      isError: false,
    });

    renderGate();

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  it('super admin bypasses gate even with expired trial', () => {
    setUser({ isSuperAdmin: true });
    mockUseSubscriptionStatus.mockReturnValue({
      data: expiredTrial,
      isLoading: false,
      isError: false,
    });

    renderGate('/dashboard');

    expect(screen.getByText('Dashboard Content')).toBeInTheDocument();
  });

  describe('expired trial — admin (tenants.read)', () => {
    beforeEach(() => {
      setUser({ permissions: ['tenants.read'] });
      setExpiredTrial();
    });

    it('redirects to /subscription from /dashboard', () => {
      renderGate('/dashboard');

      expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
      expect(screen.getByText('Subscription Content')).toBeInTheDocument();
    });

    it('redirects to /subscription from /orders', () => {
      renderGate('/orders');

      expect(screen.queryByText('Orders Content')).not.toBeInTheDocument();
      expect(screen.getByText('Subscription Content')).toBeInTheDocument();
    });

    it('allows /subscription', () => {
      renderGate('/subscription');

      expect(screen.getByText('Subscription Content')).toBeInTheDocument();
    });

    it('allows /subscription/plans', () => {
      renderGate('/subscription/plans');

      expect(screen.getByText('Plans Content')).toBeInTheDocument();
    });
  });

  describe('expired trial — regular user (no tenants.read)', () => {
    beforeEach(() => {
      setUser({ permissions: ['orders.read'] });
      setExpiredTrial();
    });

    it('shows blocking screen instead of redirect', () => {
      renderGate('/dashboard');

      expect(screen.queryByText('Dashboard Content')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Subscription Content'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('trial.expiredContactAdmin')).toBeInTheDocument();
    });

    it('shows blocking screen on any route', () => {
      renderGate('/orders');

      expect(screen.queryByText('Orders Content')).not.toBeInTheDocument();
    });
  });
});
