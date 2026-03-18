import { create } from 'zustand';
import axios from 'axios';
import type { AuthUser } from '@/shared/types/auth';

interface AuthState {
  user: AuthUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setPermissions: (permissions: string[]) => void;
  bootRefresh: () => Promise<void>;
  logout: () => Promise<void>;
}

interface JwtPayloadDecoded {
  permissions?: string[];
  isSuperAdmin?: boolean;
}

// Access token is held in memory only — never written to localStorage/sessionStorage.
// This prevents XSS attacks from extracting it.
let _accessToken: string | null = null;

export function getAccessToken(): string | null {
  return _accessToken;
}

export function decodeJwtPayload(token: string): JwtPayloadDecoded {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return {};
  }
}

function decodePermissions(token: string): string[] {
  return decodeJwtPayload(token).permissions ?? [];
}

function restoreUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

const _initialUser = restoreUser();

export const useAuthStore = create<AuthState>(() => ({
  // Token starts null — the 401 interceptor in apiClient will silently refresh on
  // the first API call and populate it.  We derive isAuthenticated from the stored
  // user profile so the router doesn't redirect to the landing page before the
  // refresh has a chance to fire.
  user: _initialUser,
  permissions: [],
  isAuthenticated: _initialUser !== null,

  setAuth: (accessToken, user) => {
    _accessToken = accessToken;
    localStorage.setItem('user', JSON.stringify(user));
    const permissions = decodePermissions(accessToken);
    useAuthStore.setState({ user, permissions, isAuthenticated: true });
  },

  setPermissions: (permissions) => useAuthStore.setState({ permissions }),

  /**
   * Proactively refresh the access token using the HttpOnly refresh_token cookie.
   * Called once on app boot so we have a valid token before any API call fires.
   * If no refresh cookie exists (or it's expired/revoked), this silently logs out.
   */
  bootRefresh: async () => {
    if (_accessToken) return; // already have a token
    if (!_initialUser) return; // no stored session
    try {
      const { data } = await axios.post(
        '/api/v1/auth/refresh',
        {},
        { withCredentials: true },
      );
      const { accessToken, user } = data.data;
      _accessToken = accessToken;
      const permissions = decodePermissions(accessToken);
      useAuthStore.setState({ user, permissions, isAuthenticated: true });
      localStorage.setItem('user', JSON.stringify(user));
    } catch {
      // Refresh failed — cookie expired or tokenVersion revoked
      _accessToken = null;
      localStorage.removeItem('user');
      useAuthStore.setState({
        user: null,
        permissions: [],
        isAuthenticated: false,
      });
    }
  },

  logout: async () => {
    // Tell the backend to invalidate the tokenVersion and clear the HttpOnly cookie.
    // Use axios directly (not apiClient) to avoid circular dependency.
    try {
      await axios.post(
        '/api/v1/auth/logout',
        {},
        {
          withCredentials: true,
          headers: {
            Authorization: `Bearer ${_accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch {
      // Ignore network / auth errors — proceed with local cleanup regardless.
    }

    _accessToken = null;
    localStorage.removeItem('user');
    useAuthStore.setState({
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  },
}));
