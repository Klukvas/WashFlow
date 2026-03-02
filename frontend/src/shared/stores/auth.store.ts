import { create } from 'zustand';
import type { AuthUser } from '@/shared/types/auth';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  permissions: string[];
  isAuthenticated: boolean;
  setAuth: (accessToken: string, refreshToken: string, user: AuthUser) => void;
  setPermissions: (permissions: string[]) => void;
  logout: () => void;
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

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: storedAccessToken,
  refreshToken: localStorage.getItem('refreshToken'),
  user: restoreUser(),
  permissions: storedAccessToken ? decodePermissions(storedAccessToken) : [],
  isAuthenticated: !!storedAccessToken,

  setAuth: (accessToken, refreshToken, user) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
    const permissions = decodePermissions(accessToken);
    set({
      accessToken,
      refreshToken,
      user,
      permissions,
      isAuthenticated: true,
    });
  },

  setPermissions: (permissions) => set({ permissions }),

  logout: () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      permissions: [],
      isAuthenticated: false,
    });
  },
}));
