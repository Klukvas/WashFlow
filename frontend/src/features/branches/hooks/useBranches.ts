import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchBranches,
  fetchBranch,
  createBranch,
  updateBranch,
  deleteBranch,
  restoreBranch,
  fetchBranchBookingSettings,
  updateBranchBookingSettings,
  type BranchQueryParams,
  type CreateBranchPayload,
  type UpdateBranchPayload,
  type UpdateBookingSettingsPayload,
} from '../api/branches.api';

export const branchKeys = {
  all: ['branches'] as const,
  lists: () => [...branchKeys.all, 'list'] as const,
  list: (params: BranchQueryParams) => [...branchKeys.lists(), params] as const,
  details: () => [...branchKeys.all, 'detail'] as const,
  detail: (id: string) => [...branchKeys.details(), id] as const,
};

export const bookingSettingsKeys = {
  all: ['booking-settings'] as const,
  detail: (branchId: string) => [...bookingSettingsKeys.all, branchId] as const,
};

export function useBranches(params: BranchQueryParams) {
  return useQuery({
    queryKey: branchKeys.list(params),
    queryFn: () => fetchBranches(params),
  });
}

export function useBranch(id: string) {
  return useQuery({
    queryKey: branchKeys.detail(id),
    queryFn: () => fetchBranch(id),
    enabled: !!id,
    staleTime: 60 * 1000,
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateBranchPayload) => createBranch(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create branch');
    },
  });
}

export function useUpdateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: UpdateBranchPayload & { id: string }) =>
      updateBranch(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
      queryClient.invalidateQueries({
        queryKey: branchKeys.detail(variables.id),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update branch');
    },
  });
}

export function useDeleteBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBranch(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete branch');
    },
  });
}

export function useRestoreBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreBranch(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
      queryClient.invalidateQueries({ queryKey: branchKeys.detail(id) });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to restore branch');
    },
  });
}

export function useBranchBookingSettings(branchId: string) {
  return useQuery({
    queryKey: bookingSettingsKeys.detail(branchId),
    queryFn: () => fetchBranchBookingSettings(branchId),
    enabled: !!branchId,
    staleTime: 60 * 1000,
  });
}

export function useUpdateBranchBookingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      branchId,
      ...payload
    }: UpdateBookingSettingsPayload & { branchId: string }) =>
      updateBranchBookingSettings(branchId, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: bookingSettingsKeys.detail(variables.branchId),
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update booking settings');
    },
  });
}
