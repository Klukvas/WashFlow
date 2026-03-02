import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWorkPosts, createWorkPost, updateWorkPost, type WorkPostQueryParams, type CreateWorkPostPayload } from '../api/work-posts.api';

export function useWorkPosts(params: WorkPostQueryParams) {
  return useQuery({
    queryKey: ['work-posts', params],
    queryFn: () => fetchWorkPosts(params),
    enabled: !!params.branchId,
  });
}

export function useCreateWorkPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateWorkPostPayload) => createWorkPost(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-posts'] }),
  });
}

export function useUpdateWorkPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }: Partial<CreateWorkPostPayload> & { id: string }) => updateWorkPost(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-posts'] }),
  });
}
