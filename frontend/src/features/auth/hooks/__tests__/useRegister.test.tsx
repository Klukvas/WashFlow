import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRegister } from '../useRegister';
import type { AuthResponse, AuthUser, RegisterRequest } from '@/shared/types/auth';

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
  register: vi.fn(),
}));

import { register } from '../../api/auth.api';

const mockedRegister = vi.mocked(register);

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
  email: 'new@example.com',
  firstName: 'New',
  lastName: 'User',
  tenantId: 'tenant-1',
  branchId: null,
  isSuperAdmin: false,
};

const fakeAuthResponse: AuthResponse = {
  accessToken: 'jwt-token',
  user: fakeUser,
};

const fakePayload: RegisterRequest = {
  companyName: 'WashCo',
  firstName: 'New',
  lastName: 'User',
  email: 'new@example.com',
  password: 'password123',
};

describe('useRegister', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls register API with payload', async () => {
    mockedRegister.mockResolvedValueOnce(fakeAuthResponse);

    const { result } = renderHook(() => useRegister(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(fakePayload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRegister).toHaveBeenCalledWith(fakePayload);
  });

  it('calls setAuth with accessToken and user on success', async () => {
    mockedRegister.mockResolvedValueOnce(fakeAuthResponse);

    const { result } = renderHook(() => useRegister(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(fakePayload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockSetAuth).toHaveBeenCalledWith(
      fakeAuthResponse.accessToken,
      fakeAuthResponse.user,
    );
  });

  it('navigates to /dashboard with replace on success', async () => {
    mockedRegister.mockResolvedValueOnce(fakeAuthResponse);

    const { result } = renderHook(() => useRegister(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(fakePayload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true });
  });

  it('does not call setAuth or navigate on failure', async () => {
    mockedRegister.mockRejectedValueOnce(new Error('Email in use'));

    const { result } = renderHook(() => useRegister(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(fakePayload);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mockSetAuth).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('returns error on failure', async () => {
    const error = new Error('Registration failed');
    mockedRegister.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useRegister(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(fakePayload);
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useRegister(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.isSuccess).toBe(false);
    expect(result.current.isError).toBe(false);
  });
});
