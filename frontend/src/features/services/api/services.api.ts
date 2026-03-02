import { apiClient, toPaginated } from '@/shared/api/client';
import type { ApiResponse, PaginatedApiResponse, PaginatedResponse, PaginationParams } from '@/shared/types/api';
import type { Service } from '@/shared/types/models';

export interface ServiceQueryParams extends PaginationParams {
  search?: string;
}

export interface CreateServicePayload {
  name: string;
  description?: string;
  durationMin: number;
  price: number;
  isActive?: boolean;
  sortOrder?: number;
}

export type UpdateServicePayload = Partial<CreateServicePayload>;

export async function fetchServices(
  params: ServiceQueryParams,
): Promise<PaginatedResponse<Service>> {
  const { data } = await apiClient.get<PaginatedApiResponse<Service>>(
    '/services',
    { params },
  );
  return toPaginated(data);
}

export async function fetchService(id: string): Promise<Service> {
  const { data } = await apiClient.get<ApiResponse<Service>>(`/services/${id}`);
  return data.data;
}

export async function createService(payload: CreateServicePayload): Promise<Service> {
  const { data } = await apiClient.post<ApiResponse<Service>>('/services', payload);
  return data.data;
}

export async function updateService(
  id: string,
  payload: UpdateServicePayload,
): Promise<Service> {
  const { data } = await apiClient.patch<ApiResponse<Service>>(
    `/services/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteService(id: string): Promise<void> {
  await apiClient.delete(`/services/${id}`);
}

export async function restoreService(id: string): Promise<Service> {
  const { data } = await apiClient.patch<ApiResponse<Service>>(
    `/services/${id}/restore`,
  );
  return data.data;
}
