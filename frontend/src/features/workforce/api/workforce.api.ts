import { apiClient, toPaginated } from '@/shared/api/client';
import type { EmployeeProfile } from '@/shared/types/models';
import type { ApiResponse, PaginatedApiResponse, PaginatedResponse } from '@/shared/types/api';

export interface EmployeeProfileQueryParams {
  page?: number;
  limit?: number;
  branchId?: string;
  active?: boolean;
}

export interface CreateEmployeeProfilePayload {
  userId: string;
  branchId: string;
  isWorker?: boolean;
  efficiencyCoefficient?: number;
  workStartTime?: string;
  workEndTime?: string;
}

export interface UpdateEmployeeProfilePayload {
  branchId?: string;
  isWorker?: boolean;
  active?: boolean;
  efficiencyCoefficient?: number;
  workStartTime?: string;
  workEndTime?: string;
}

export async function fetchProfiles(
  params: EmployeeProfileQueryParams = {},
): Promise<PaginatedResponse<EmployeeProfile>> {
  const { data } = await apiClient.get<PaginatedApiResponse<EmployeeProfile>>(
    '/workforce/profiles',
    { params },
  );
  return toPaginated(data);
}

export async function fetchProfile(id: string): Promise<EmployeeProfile> {
  const { data } = await apiClient.get<ApiResponse<EmployeeProfile>>(`/workforce/profiles/${id}`);
  return data.data;
}

export async function createProfile(
  payload: CreateEmployeeProfilePayload,
): Promise<EmployeeProfile> {
  const { data } = await apiClient.post<ApiResponse<EmployeeProfile>>('/workforce/profiles', payload);
  return data.data;
}

export async function updateProfile(
  id: string,
  payload: UpdateEmployeeProfilePayload,
): Promise<EmployeeProfile> {
  const { data } = await apiClient.patch<ApiResponse<EmployeeProfile>>(
    `/workforce/profiles/${id}`,
    payload,
  );
  return data.data;
}

export async function deactivateProfile(id: string): Promise<EmployeeProfile> {
  const { data } = await apiClient.delete<ApiResponse<EmployeeProfile>>(`/workforce/profiles/${id}`);
  return data.data;
}
