import { create } from 'zustand';
import axios from 'axios';
import type { AuthUser } from '@/shared/types/auth';

interface AuthState {
  user: AuthUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  setAuth: (accessToken: string, user: AuthUser) => void;
  setPermissions: (permissions: string[]) => void;
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

export const useAuthStore = create<AuthState>(() => ({
  // No token in initial state — a silent refresh call on app boot will populate it.
  user: restoreUser(),
  permissions: [],
  isAuthenticated: false,

  setAuth: (accessToken, user) => {
    _accessToken = accessToken;
    localStorage.setItem('user', JSON.stringify(user));
    const permissions = decodePermissions(accessToken);
    useAuthStore.setState({ user, permissions, isAuthenticated: true });
  },

  setPermissions: (permissions) => useAuthStore.setState({ permissions }),

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
