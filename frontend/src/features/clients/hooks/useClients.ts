import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchClients,
  fetchClient,
  createClient,
  updateClient,
  deleteClient,
  restoreClient,
  mergeClients,
  type ClientQueryParams,
  type CreateClientPayload,
  type UpdateClientPayload,
  type MergeClientsPayload,
} from '../api/clients.api';

export function useClients(params: ClientQueryParams) {
  return useQuery({
    queryKey: ['clients', params],
    queryFn: () => fetchClients(params),
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: ['clients', id],
    queryFn: () => fetchClient(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateClientPayload) => createClient(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create client');
    },
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateClientPayload & { id: string }) =>
      updateClient(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', variables.id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update client');
    },
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete client');
    },
  });
}

export function useRestoreClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreClient(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients', id] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore client');
    },
  });
}

export function useMergeClients() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: MergeClientsPayload) => mergeClients(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to merge clients');
    },
  });
}
