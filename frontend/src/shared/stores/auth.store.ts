import { create } from 'zustand';
import axios from 'axios';
import type { AuthUser } from '@/shared/types/auth';

interface AuthState {
  accessToken: string | null;
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

const storedAccessToken = localStorage.getItem('accessToken');

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: storedAccessToken,
  user: restoreUser(),
  permissions: storedAccessToken ? decodePermissions(storedAccessToken) : [],
  isAuthenticated: !!storedAccessToken,

  setAuth: (accessToken, user) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('user', JSON.stringify(user));
    const permissions = decodePermissions(accessToken);
    set({ accessToken, user, permissions, isAuthenticated: true });
  },

  setPermissions: (permissions) => set({ permissions }),

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
            Authorization: `Bearer ${get().accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch {
      // Ignore network / auth errors — proceed with local cleanup regardless.
    }

    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    set({
      accessToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  },
}));
