import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchServices,
  fetchService,
  createService,
  updateService,
  deleteService,
  restoreService,
  type ServiceQueryParams,
  type CreateServicePayload,
  type UpdateServicePayload,
} from '../api/services.api';

export const serviceKeys = {
  all: ['services'] as const,
  lists: () => [...serviceKeys.all, 'list'] as const,
  list: (params: ServiceQueryParams) => [...serviceKeys.lists(), params] as const,
  details: () => [...serviceKeys.all, 'detail'] as const,
  detail: (id: string) => [...serviceKeys.details(), id] as const,
};

export function useServices(params: ServiceQueryParams) {
  return useQuery({
    queryKey: serviceKeys.list(params),
    queryFn: () => fetchServices(params),
  });
}

export function useService(id: string) {
  return useQuery({
    queryKey: serviceKeys.detail(id),
    queryFn: () => fetchService(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateServicePayload) => createService(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create service');
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateServicePayload & { id: string }) =>
      updateService(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(variables.id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update service');
    },
  });
}

export function useDeleteService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete service');
    },
  });
}

export function useRestoreService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreService(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: serviceKeys.all });
      queryClient.invalidateQueries({ queryKey: serviceKeys.detail(id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore service');
    },
  });
}
