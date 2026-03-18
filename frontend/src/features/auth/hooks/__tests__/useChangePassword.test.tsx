import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useChangePassword, useResetUserPassword } from '../useChangePassword';

vi.mock('../../api/auth.api', () => ({
  changePassword: vi.fn(),
  resetUserPassword: vi.fn(),
}));

import { changePassword, resetUserPassword } from '../../api/auth.api';

const mockedChangePassword = vi.mocked(changePassword);
const mockedResetUserPassword = vi.mocked(resetUserPassword);

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

describe('useChangePassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls changePassword API with payload', async () => {
    mockedChangePassword.mockResolvedValueOnce(undefined);
    const payload = { currentPassword: 'old123', newPassword: 'new456' };

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedChangePassword).toHaveBeenCalledWith(payload);
  });

  it('handles errors', async () => {
    const error = new Error('Wrong password');
    mockedChangePassword.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ currentPassword: 'wrong', newPassword: 'new456' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useChangePassword(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
  });
});

describe('useResetUserPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls resetUserPassword API with userId and newPassword', async () => {
    mockedResetUserPassword.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useResetUserPassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ userId: 'user-1', newPassword: 'reset123' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedResetUserPassword).toHaveBeenCalledWith('user-1', 'reset123');
  });

  it('handles errors', async () => {
    const error = new Error('Not authorized');
    mockedResetUserPassword.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useResetUserPassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ userId: 'user-1', newPassword: 'reset123' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useResetUserPassword(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isIdle).toBe(true);
  });
});
