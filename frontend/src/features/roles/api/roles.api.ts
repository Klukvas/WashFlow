import { apiClient, toPaginated } from '@/shared/api/client';
import type { ApiResponse, PaginatedApiResponse, PaginatedResponse } from '@/shared/types/api';
import type { Role, Permission } from '@/shared/types/models';

export interface RoleQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface CreateRolePayload {
  name: string;
  description?: string;
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
}

export interface AssignPermissionsPayload {
  permissionIds: string[];
}

export async function fetchRoles(
  params: RoleQueryParams,
): Promise<PaginatedResponse<Role>> {
  const { data } = await apiClient.get<PaginatedApiResponse<Role>>(
    '/roles',
    { params },
  );
  return toPaginated(data);
}

export async function fetchRole(id: string): Promise<Role> {
  const { data } = await apiClient.get<ApiResponse<Role>>(`/roles/${id}`);
  return data.data;
}

export async function createRole(payload: CreateRolePayload): Promise<Role> {
  const { data } = await apiClient.post<ApiResponse<Role>>(
    '/roles',
    payload,
  );
  return data.data;
}

export async function updateRole(
  id: string,
  payload: UpdateRolePayload,
): Promise<Role> {
  const { data } = await apiClient.patch<ApiResponse<Role>>(
    `/roles/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteRole(id: string): Promise<void> {
  await apiClient.delete(`/roles/${id}`);
}

export async function restoreRole(id: string): Promise<Role> {
  const { data } = await apiClient.patch<ApiResponse<Role>>(
    `/roles/${id}/restore`,
  );
  return data.data;
}

export async function assignPermissions(
  id: string,
  payload: AssignPermissionsPayload,
): Promise<Role> {
  const { data } = await apiClient.post<ApiResponse<Role>>(
    `/roles/${id}/permissions`,
    payload,
  );
  return data.data;
}

export async function fetchPermissions(): Promise<Permission[]> {
  const { data } = await apiClient.get<ApiResponse<Permission[]>>(
    '/permissions',
  );
  return data.data;
}
