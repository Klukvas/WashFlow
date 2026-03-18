import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchWorkPosts,
  createWorkPost,
  updateWorkPost,
  type WorkPostQueryParams,
  type CreateWorkPostPayload,
} from '../api/work-posts.api';

export const workPostKeys = {
  all: ['work-posts'] as const,
  list: (params: WorkPostQueryParams) => [...workPostKeys.all, params] as const,
};

export function useWorkPosts(params: WorkPostQueryParams) {
  return useQuery({
    queryKey: workPostKeys.list(params),
    queryFn: () => fetchWorkPosts(params),
    enabled: !!params.branchId,
  });
}

export function useCreateWorkPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkPostPayload) => createWorkPost(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-posts'] }),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create work post');
    },
  });
}

export function useUpdateWorkPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...payload
    }: Partial<CreateWorkPostPayload> & { id: string }) =>
      updateWorkPost(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-posts'] }),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update work post');
    },
  });
}
