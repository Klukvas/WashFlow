import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useLogin } from '../useLogin';
import type { AuthResponse, AuthUser, LoginRequest } from '@/shared/types/auth';

const mockNavigate = vi.fn();
const mockSetAuth = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { setAuth: typeof mockSetAuth }) => unknown) =>
    selector({ setAuth: mockSetAuth }),
}));

vi.mock('../../api/auth.api', () => ({
  login: vi.fn(),
}));

import { login } from '../../api/auth.api';

const mockedLogin = vi.mocked(login);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const fakeUser: AuthUser = {
  id: 'user-1',
  email: 'test@example.com',
  firstName: 'Test',
  lastName: 'User',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: false,
};

const fakeAuthResponse: AuthResponse = {
  accessToken: 'fake-jwt-token',
  user: fakeUser,
};

describe('useLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls login API with email and password', async () => {
    mockedLogin.mockResolvedValueOnce(fakeAuthResponse);
    const credentials: LoginRequest = {
      email: 'test@example.com',
      password: 'password123',
    };

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(credentials);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedLogin).toHaveBeenCalledWith(credentials);
  });

  it('calls setAuth with token and user on success', async () => {
    mockedLogin.mockResolvedValueOnce(fakeAuthResponse);

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockSetAuth).toHaveBeenCalledWith(
      fakeAuthResponse.accessToken,
      fakeAuthResponse.user,
    );
  });

  it('navigates to /dashboard with replace on success', async () => {
    mockedLogin.mockResolvedValueOnce(fakeAuthResponse);

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('calls setAuth before navigate on success', async () => {
    const callOrder: string[] = [];
    mockSetAuth.mockImplementation(() => {
      callOrder.push('setAuth');
    });
    mockNavigate.mockImplementation(() => {
      callOrder.push('navigate');
    });
    mockedLogin.mockResolvedValueOnce(fakeAuthResponse);

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(callOrder).toEqual(['setAuth', 'navigate']);
  });

  it('does not call setAuth or navigate on failure', async () => {
    mockedLogin.mockRejectedValueOnce(new Error('Invalid credentials'));

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: 'wrong@example.com',
        password: 'bad',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns the error when login fails', async () => {
    const error = new Error('Invalid credentials');
    mockedLogin.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: 'wrong@example.com',
        password: 'bad',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('exposes mutate and mutateAsync functions', () => {
    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    expect(typeof result.current.mutate).toBe('function');
    expect(typeof result.current.mutateAsync).toBe('function');
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useLogin(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
    expect(result.current.isPending).toBe(false);
  });
});
