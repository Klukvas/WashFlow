import { apiClient, toPaginated } from '@/shared/api/client';
import type {
  ApiResponse,
  PaginatedApiResponse,
  PaginatedResponse,
} from '@/shared/types/api';
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
  const { data } = await apiClient.get<PaginatedApiResponse<WorkPost>>(
    '/work-posts',
    { params },
  );
  return toPaginated(data);
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
