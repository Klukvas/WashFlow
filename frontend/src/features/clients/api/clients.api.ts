import { apiClient, toPaginated } from '@/shared/api/client';
import type {
  ApiResponse,
  PaginatedApiResponse,
  PaginatedResponse,
} from '@/shared/types/api';
import type { Client } from '@/shared/types/models';

export interface ClientQueryParams {
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface CreateClientPayload {
  firstName: string;
  lastName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export interface UpdateClientPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

export async function fetchClients(
  params: ClientQueryParams,
): Promise<PaginatedResponse<Client>> {
  const { data } = await apiClient.get<PaginatedApiResponse<Client>>(
    '/clients',
    { params },
  );
  return toPaginated(data);
}

export async function fetchClient(id: string): Promise<Client> {
  const { data } = await apiClient.get<ApiResponse<Client>>(`/clients/${id}`);
  return data.data;
}

export async function createClient(
  payload: CreateClientPayload,
): Promise<Client> {
  const { data } = await apiClient.post<ApiResponse<Client>>(
    '/clients',
    payload,
  );
  return data.data;
}

export async function updateClient(
  id: string,
  payload: UpdateClientPayload,
): Promise<Client> {
  const { data } = await apiClient.patch<ApiResponse<Client>>(
    `/clients/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteClient(id: string): Promise<void> {
  await apiClient.delete(`/clients/${id}`);
}

export async function restoreClient(id: string): Promise<Client> {
  const { data } = await apiClient.patch<ApiResponse<Client>>(
    `/clients/${id}/restore`,
  );
  return data.data;
}

export interface MergeClientsPayload {
  sourceClientId: string;
  targetClientId: string;
  fieldOverrides: {
    firstName: string;
    lastName?: string;
    phone?: string;
    email?: string;
    notes?: string;
  };
}

export async function mergeClients(
  payload: MergeClientsPayload,
): Promise<Client> {
  const { data } = await apiClient.post<ApiResponse<Client>>(
    '/clients/merge',
    payload,
  );
  return data.data;
}
