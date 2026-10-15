import { create } from 'zustand';
import axios, { CanceledError } from 'axios';
import type { AuthResponse, AuthUser } from '@/shared/types/auth';
import { queryClient } from '@/shared/api/query-client';

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
let sessionVersion = 0;
let authCookieRequests: Promise<void> | null = null;
let authTransitionVersion: number | null = null;
let cookieAccessToken: string | null = null;
const authResponseOwners = new WeakMap<
  AuthUser,
  { token: string; version: number }
>();

/** Start cookie writers lazily, only after the previous response was handled. */
export function runAuthCookieRequest<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const request = authCookieRequests
    ? authCookieRequests.then(operation)
    : operation();
  const settled = request.then(
    () => undefined,
    () => undefined,
  );
  authCookieRequests = settled;
  void settled.then(() => {
    if (authCookieRequests === settled) authCookieRequests = null;
  });
  return request;
}

/** apiClient holds this lease through its response interceptor, including errors. */
export function acquireAuthCookieLease(): Promise<() => void> {
  return new Promise((acquired) => {
    void runAuthCookieRequest(
      () => new Promise<void>((release) => acquired(release)),
    );
  });
}

export function isAuthTransitionPending(): boolean {
  return authTransitionVersion !== null;
}

export function beginAuthTransition(): number {
  cookieAccessToken ??= _accessToken;
  clearSession();
  authTransitionVersion = sessionVersion;
  return sessionVersion;
}

export function finishAuthTransition(version: number): void {
  if (authTransitionVersion === version) authTransitionVersion = null;
}

export function applyAuthCookieResponse(
  response: AuthResponse,
  version: number,
): void {
  // Even a superseded response changed the browser cookie. A queued logout must
  // revoke/clear that cookie's account, including logout during an in-flight login.
  cookieAccessToken = response.accessToken;
  authResponseOwners.set(response.user, {
    token: response.accessToken,
    version,
  });
  if (version !== sessionVersion) throw new CanceledError('Session changed');
  useAuthStore.getState().setAuth(response.accessToken, response.user);
  authResponseOwners.set(response.user, {
    token: response.accessToken,
    version: sessionVersion,
  });
}

/** Identifies the account/access scope that owns an in-flight request. */
export function getAuthSessionVersion(): number {
  return sessionVersion;
}

function resetSessionCache(): void {
  sessionVersion += 1;
  // clear() synchronously destroys/cancels queries before removing both caches.
  // An old network promise may still settle, but cannot update the new cache.
  queryClient.clear();
}

function samePermissions(current: string[], next: string[]): boolean {
  return (
    current.length === next.length &&
    current.every((value) => next.includes(value))
  );
}

function clearSession(): void {
  _accessToken = null;
  resetSessionCache();
  localStorage.removeItem('user');
  useAuthStore.setState({
    user: null,
    permissions: [],
    isAuthenticated: false,
  });
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function decodeJwtPayload(token: string): JwtPayloadDecoded | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch (err) {
    console.warn('[auth] Failed to decode JWT payload:', err);
    return null;
  }
}

function decodePermissions(token: string): string[] {
  return decodeJwtPayload(token)?.permissions ?? [];
}

function isValidAuthUser(value: unknown): value is AuthUser {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as AuthUser).id === 'string' &&
    typeof (value as AuthUser).email === 'string' &&
    typeof (value as AuthUser).tenantId === 'string'
  );
}

function restoreUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidAuthUser(parsed)) {
      console.warn(
        '[auth] Restored user data missing required fields, clearing',
      );
      localStorage.removeItem('user');
      return null;
    }
    return parsed;
  } catch {
    localStorage.removeItem('user');
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
    const owner = authResponseOwners.get(user);
    if (owner?.token === accessToken && owner.version !== sessionVersion)
      return;
    const current = useAuthStore.getState();
    const permissions = decodePermissions(accessToken);
    const sameScope =
      current.user?.id === user.id &&
      current.user.tenantId === user.tenantId &&
      current.user.branchId === user.branchId &&
      current.user.isSuperAdmin === user.isSuperAdmin &&
      samePermissions(current.permissions, permissions);
    if (!sameScope) resetSessionCache();
    _accessToken = accessToken;
    localStorage.setItem('user', JSON.stringify(user));
    useAuthStore.setState({ user, permissions, isAuthenticated: true });
  },

  setPermissions: (permissions) => {
    if (!samePermissions(useAuthStore.getState().permissions, permissions)) {
      resetSessionCache();
    }
    useAuthStore.setState({ permissions });
  },

  /**
   * Proactively refresh the access token using the HttpOnly refresh_token cookie.
   * Called once on app boot so we have a valid token before any API call fires.
   * If no refresh cookie exists (or it's expired/revoked), this silently logs out.
   */
  bootRefresh: async () => {
    if (isAuthTransitionPending()) return;
    if (_accessToken) return; // already have a token
    if (!useAuthStore.getState().user) return; // no stored session
    const version = sessionVersion;
    try {
      await runAuthCookieRequest(async () => {
        if (version !== sessionVersion || isAuthTransitionPending())
          throw new CanceledError('Session changed');
        const { data } = await axios.post(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );
        applyAuthCookieResponse(data.data, version);
      });
    } catch {
      // Refresh failed — cookie expired or tokenVersion revoked
      if (version === sessionVersion) clearSession();
    }
  },

  logout: async () => {
    const accessToken = _accessToken;
    const version = beginAuthTransition();
    // Tell the backend to invalidate the tokenVersion and clear the HttpOnly cookie.
    // Use axios directly (not apiClient) to avoid circular dependency.
    try {
      await runAuthCookieRequest(async () => {
        await axios.post(
          '/api/v1/auth/logout',
          {},
          {
            withCredentials: true,
            headers: {
              Authorization: `Bearer ${cookieAccessToken ?? accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        );
        cookieAccessToken = null;
      });
    } catch {
      // Ignore network / auth errors — proceed with local cleanup regardless.
    } finally {
      finishAuthTransition(version);
    }
  },
}));
