import { apiClient, withIdempotencyKey, toPaginated } from '@/shared/api/client';
import type { ApiResponse, PaginatedApiResponse, PaginatedResponse, PaginationParams } from '@/shared/types/api';
import type { User } from '@/shared/types/models';

export interface UserQueryParams extends PaginationParams {
  includeDeleted?: boolean;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  branchId?: string;
  roleId?: string;
}

export interface UpdateUserPayload {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  branchId?: string | null;
  roleId?: string | null;
}

export async function fetchUsers(
  params: UserQueryParams,
): Promise<PaginatedResponse<User>> {
  const { data } = await apiClient.get<PaginatedApiResponse<User>>(
    '/users',
    { params },
  );
  return toPaginated(data);
}

export async function fetchUser(id: string): Promise<User> {
  const { data } = await apiClient.get<ApiResponse<User>>(`/users/${id}`);
  return data.data;
}

export async function createUser(payload: CreateUserPayload): Promise<User> {
  const { data } = await apiClient.post<ApiResponse<User>>(
    '/users',
    payload,
    withIdempotencyKey(),
  );
  return data.data;
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<User> {
  const { data } = await apiClient.patch<ApiResponse<User>>(
    `/users/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}

export async function restoreUser(id: string): Promise<User> {
  const { data } = await apiClient.patch<ApiResponse<User>>(
    `/users/${id}/restore`,
  );
  return data.data;
}
