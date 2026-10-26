import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { DashboardPage } from '../../pages/DashboardPage';
const state = vi.hoisted(() => ({ allowed: false, analytics: vi.fn() }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => state.allowed }),
}));
vi.mock('../DashboardAnalytics', () => ({
  DashboardAnalytics: () => {
    state.analytics();
    return <p>analytics failure</p>;
  },
}));
describe('dashboard setup isolation', () => {
  it('does not mount protected analytics and retains setup entry for custom roles', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(state.analytics).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: /setup.entry/ })).toHaveAttribute(
      'href',
      '/setup',
    );
  });
  it('analytics failure content cannot hide setup entry', () => {
    state.allowed = true;
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    expect(screen.getByText('analytics failure')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /setup.entry/ }),
    ).toBeInTheDocument();
  });
});
