import { apiClient } from '@/shared/api/client';
import type { ApiResponse, PaginatedResponse } from '@/shared/types/api';
import type { WorkPost } from '@/shared/types/models';

export interface WorkPostQueryParams {
  branchId?: string;
  page?: number;
  limit?: number;
}

export interface CreateWorkPostPayload {
  name: string;
  branchId: string;
}

export async function fetchWorkPosts(
  params: WorkPostQueryParams,
): Promise<PaginatedResponse<WorkPost>> {
  const { data } = await apiClient.get<ApiResponse<WorkPost[]>>(
    '/work-posts',
    { params: { branchId: params.branchId } },
  );
  if (!Array.isArray(data.data)) {
    throw new Error('Invalid work-post list response');
  }
  // This endpoint returns the complete filtered collection, not server-side pages.
  // Preserve the shared hook shape while deriving its count from the actual list.
  return {
    items: data.data,
    meta: {
      total: data.data.length,
      page: 1,
      limit: Math.max(data.data.length, 1),
      totalPages: 1,
    },
  };
}

export async function createWorkPost(
  payload: CreateWorkPostPayload,
): Promise<WorkPost> {
  const { data } = await apiClient.post<ApiResponse<WorkPost>>(
    '/work-posts',
    payload,
  );
  return data.data;
}

export async function updateWorkPost(
  id: string,
  payload: Partial<CreateWorkPostPayload>,
): Promise<WorkPost> {
  const { data } = await apiClient.patch<ApiResponse<WorkPost>>(
    `/work-posts/${id}`,
    payload,
  );
  return data.data;
}
