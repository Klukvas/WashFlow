import { apiClient, toPaginated } from '@/shared/api/client';
import type { ApiResponse, PaginatedApiResponse, PaginatedResponse, PaginationParams } from '@/shared/types/api';
import type { Vehicle } from '@/shared/types/models';

export interface VehicleQueryParams extends PaginationParams {
  clientId?: string;
  search?: string;
  includeDeleted?: boolean;
}

export interface CreateVehiclePayload {
  clientId: string;
  make: string;
  licensePlate?: string;
  model?: string;
  color?: string;
  year?: number;
}

export async function fetchVehicles(params: VehicleQueryParams): Promise<PaginatedResponse<Vehicle>> {
  const { data } = await apiClient.get<PaginatedApiResponse<Vehicle>>('/vehicles', { params });
  return toPaginated(data);
}

export async function fetchVehicle(id: string): Promise<Vehicle> {
  const { data } = await apiClient.get<ApiResponse<Vehicle>>(`/vehicles/${id}`);
  return data.data;
}

export async function createVehicle(payload: CreateVehiclePayload): Promise<Vehicle> {
  const { data } = await apiClient.post<ApiResponse<Vehicle>>('/vehicles', payload);
  return data.data;
}

export async function updateVehicle(id: string, payload: Partial<CreateVehiclePayload>): Promise<Vehicle> {
  const { data } = await apiClient.patch<ApiResponse<Vehicle>>(`/vehicles/${id}`, payload);
  return data.data;
}

export async function deleteVehicle(id: string): Promise<void> {
  await apiClient.delete(`/vehicles/${id}`);
}

export async function restoreVehicle(id: string): Promise<Vehicle> {
  const { data } = await apiClient.patch<ApiResponse<Vehicle>>(`/vehicles/${id}/restore`);
  return data.data;
}
