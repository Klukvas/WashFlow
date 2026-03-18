import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useClients,
  useClient,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  useRestoreClient,
  useMergeClients,
} from '../useClients';
import type {
  ClientQueryParams,
  CreateClientPayload,
  MergeClientsPayload,
} from '../../api/clients.api';
import type { Client } from '@/shared/types/models';
import type { PaginatedResponse } from '@/shared/types/api';

vi.mock('../../api/clients.api', () => ({
  fetchClients: vi.fn(),
  fetchClient: vi.fn(),
  createClient: vi.fn(),
  updateClient: vi.fn(),
  deleteClient: vi.fn(),
  restoreClient: vi.fn(),
  mergeClients: vi.fn(),
}));

import {
  fetchClients,
  fetchClient,
  createClient,
  updateClient,
  deleteClient,
  restoreClient,
  mergeClients,
} from '../../api/clients.api';

const mockedFetchClients = vi.mocked(fetchClients);
const mockedFetchClient = vi.mocked(fetchClient);
const mockedCreateClient = vi.mocked(createClient);
const mockedUpdateClient = vi.mocked(updateClient);
const mockedDeleteClient = vi.mocked(deleteClient);
const mockedRestoreClient = vi.mocked(restoreClient);
const mockedMergeClients = vi.mocked(mergeClients);

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

function createQueryClientAndWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { queryClient, invalidateSpy, Wrapper };
}

const fakeClient: Client = {
  id: 'client-1',
  tenantId: 'tenant-1',
  firstName: 'John',
  lastName: 'Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  notes: null,
  createdAt: '2026-03-15T09:00:00Z',
  updatedAt: '2026-03-15T09:00:00Z',
  deletedAt: null,
};

const fakePaginatedResponse: PaginatedResponse<Client> = {
  items: [fakeClient],
  meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
};

describe('useClients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches clients with the given params', async () => {
    mockedFetchClients.mockResolvedValueOnce(fakePaginatedResponse);
    const params: ClientQueryParams = { page: 1, limit: 10 };

    const { result } = renderHook(() => useClients(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchClients).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual(fakePaginatedResponse);
  });

  it('includes params in the query key for cache separation', async () => {
    mockedFetchClients.mockResolvedValue(fakePaginatedResponse);
    const wrapper = createWrapper();

    const { result: r1 } = renderHook(() => useClients({ search: 'john' }), {
      wrapper,
    });
    const { result: r2 } = renderHook(() => useClients({ search: 'jane' }), {
      wrapper,
    });

    await waitFor(() => expect(r1.current.isSuccess).toBe(true));
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));

    expect(mockedFetchClients).toHaveBeenCalledTimes(2);
    expect(mockedFetchClients).toHaveBeenCalledWith({ search: 'john' });
    expect(mockedFetchClients).toHaveBeenCalledWith({ search: 'jane' });
  });

  it('propagates fetch errors', async () => {
    const error = new Error('Server error');
    mockedFetchClients.mockRejectedValueOnce(error);

    const { result } = renderHook(() => useClients({ page: 1 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(error);
  });
});

describe('useClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches a single client by id', async () => {
    mockedFetchClient.mockResolvedValueOnce(fakeClient);

    const { result } = renderHook(() => useClient('client-1'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockedFetchClient).toHaveBeenCalledWith('client-1');
    expect(result.current.data).toEqual(fakeClient);
  });

  it('is disabled when id is empty', () => {
    const { result } = renderHook(() => useClient(''), {
      wrapper: createWrapper(),
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(mockedFetchClient).not.toHaveBeenCalled();
  });
});

describe('useCreateClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createClient API and returns the result', async () => {
    mockedCreateClient.mockResolvedValueOnce(fakeClient);
    const payload: CreateClientPayload = {
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
    };

    const { result } = renderHook(() => useCreateClient(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedCreateClient).toHaveBeenCalledWith(payload);
    expect(result.current.data).toEqual(fakeClient);
  });

  it('invalidates clients queries on success', async () => {
    mockedCreateClient.mockResolvedValueOnce(fakeClient);
    const { invalidateSpy, Wrapper } = createQueryClientAndWrapper();

    const { result } = renderHook(() => useCreateClient(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({ firstName: 'John' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
  });
});

describe('useUpdateClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateClient with id and payload', async () => {
    const updatedClient = { ...fakeClient, firstName: 'Jane' };
    mockedUpdateClient.mockResolvedValueOnce(updatedClient);

    const { result } = renderHook(() => useUpdateClient(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ id: 'client-1', firstName: 'Jane' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedUpdateClient).toHaveBeenCalledWith('client-1', {
      firstName: 'Jane',
    });
    expect(result.current.data).toEqual(updatedClient);
  });

  it('invalidates clients list and specific client queries on success', async () => {
    const updatedClient = { ...fakeClient, firstName: 'Jane' };
    mockedUpdateClient.mockResolvedValueOnce(updatedClient);
    const { invalidateSpy, Wrapper } = createQueryClientAndWrapper();

    const { result } = renderHook(() => useUpdateClient(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({ id: 'client-1', firstName: 'Jane' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['clients', 'client-1'],
    });
  });
});

describe('useDeleteClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls deleteClient API with the id', async () => {
    mockedDeleteClient.mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useDeleteClient(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('client-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDeleteClient).toHaveBeenCalledWith('client-1');
  });

  it('invalidates clients queries on success', async () => {
    mockedDeleteClient.mockResolvedValueOnce(undefined);
    const { invalidateSpy, Wrapper } = createQueryClientAndWrapper();

    const { result } = renderHook(() => useDeleteClient(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate('client-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
  });
});

describe('useRestoreClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls restoreClient API with the id', async () => {
    mockedRestoreClient.mockResolvedValueOnce(fakeClient);

    const { result } = renderHook(() => useRestoreClient(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate('client-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedRestoreClient).toHaveBeenCalledWith('client-1');
    expect(result.current.data).toEqual(fakeClient);
  });

  it('invalidates clients list and specific client queries on success', async () => {
    mockedRestoreClient.mockResolvedValueOnce(fakeClient);
    const { invalidateSpy, Wrapper } = createQueryClientAndWrapper();

    const { result } = renderHook(() => useRestoreClient(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate('client-1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['clients', 'client-1'],
    });
  });
});

describe('useMergeClients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls mergeClients API with the payload', async () => {
    mockedMergeClients.mockResolvedValueOnce(fakeClient);
    const payload: MergeClientsPayload = {
      sourceClientId: 'client-2',
      targetClientId: 'client-1',
      fieldOverrides: {
        firstName: 'John',
        lastName: 'Doe',
      },
    };

    const { result } = renderHook(() => useMergeClients(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate(payload);
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedMergeClients).toHaveBeenCalledWith(payload);
    expect(result.current.data).toEqual(fakeClient);
  });

  it('invalidates clients queries on success', async () => {
    mockedMergeClients.mockResolvedValueOnce(fakeClient);
    const { invalidateSpy, Wrapper } = createQueryClientAndWrapper();

    const { result } = renderHook(() => useMergeClients(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate({
        sourceClientId: 'client-2',
        targetClientId: 'client-1',
        fieldOverrides: { firstName: 'John' },
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['clients'] });
  });
});
