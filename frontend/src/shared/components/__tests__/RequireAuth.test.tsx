import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { RequireAuth } from '../RequireAuth';

let mockIsAuthenticated = false;

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { isAuthenticated: boolean }) => unknown) =>
    selector({ isAuthenticated: mockIsAuthenticated }),
}));

describe('RequireAuth', () => {
  beforeEach(() => {
    mockIsAuthenticated = false;
  });

  it('renders children when user is authenticated', () => {
    mockIsAuthenticated = true;

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Protected Content')).toBeInTheDocument();
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument();
  });

  it('redirects to /login when user is not authenticated', () => {
    mockIsAuthenticated = false;

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <div>Protected Content</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('preserves the original path in location state when redirecting', () => {
    mockIsAuthenticated = false;

    let navigatedState: unknown = null;

    function CaptureState() {
      const loc = useLocation();
      navigatedState = loc.state;
      return <div>Login Page With State</div>;
    }

    render(
      <MemoryRouter initialEntries={['/dashboard/settings']}>
        <Routes>
          <Route
            path="/dashboard/settings"
            element={
              <RequireAuth>
                <div>Settings</div>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<CaptureState />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.getByText('Login Page With State')).toBeInTheDocument();
    expect(navigatedState).toEqual({ from: '/dashboard/settings' });
  });
});
