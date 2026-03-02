import {
  apiClient,
  withIdempotencyKey,
  toPaginated,
} from '@/shared/api/client';
import type {
  ApiResponse,
  PaginatedApiResponse,
  PaginatedResponse,
} from '@/shared/types/api';
import type { BookingSettings, Branch, WorkPost } from '@/shared/types/models';

export interface BranchQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface CreateBranchPayload {
  name: string;
  address?: string;
  phone?: string;
}

export interface UpdateBranchPayload {
  name?: string;
  address?: string;
  phone?: string;
}

export async function fetchBranches(
  params: BranchQueryParams,
): Promise<PaginatedResponse<Branch>> {
  const { data } = await apiClient.get<PaginatedApiResponse<Branch>>(
    '/branches',
    { params },
  );
  return toPaginated(data);
}

export async function fetchBranch(id: string): Promise<Branch> {
  const { data } = await apiClient.get<ApiResponse<Branch>>(`/branches/${id}`);
  return data.data;
}

export async function createBranch(
  payload: CreateBranchPayload,
): Promise<Branch> {
  const { data } = await apiClient.post<ApiResponse<Branch>>(
    '/branches',
    payload,
    withIdempotencyKey(),
  );
  return data.data;
}

export async function updateBranch(
  id: string,
  payload: UpdateBranchPayload,
): Promise<Branch> {
  const { data } = await apiClient.patch<ApiResponse<Branch>>(
    `/branches/${id}`,
    payload,
  );
  return data.data;
}

export async function deleteBranch(id: string): Promise<void> {
  await apiClient.delete(`/branches/${id}`);
}

export async function restoreBranch(id: string): Promise<Branch> {
  const { data } = await apiClient.patch<ApiResponse<Branch>>(
    `/branches/${id}/restore`,
  );
  return data.data;
}

export interface WorkPostQueryParams {
  branchId: string;
  page?: number;
  limit?: number;
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

export interface UpdateBookingSettingsPayload {
  slotDurationMinutes?: number;
  bufferTimeMinutes?: number;
  maxAdvanceBookingDays?: number;
  allowOnlineBooking?: boolean;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: number[];
}

export async function fetchBranchBookingSettings(
  branchId: string,
): Promise<BookingSettings | null> {
  const { data } = await apiClient.get<ApiResponse<BookingSettings | null>>(
    `/branches/${branchId}/booking-settings`,
  );
  return data.data;
}

export async function updateBranchBookingSettings(
  branchId: string,
  payload: UpdateBookingSettingsPayload,
): Promise<BookingSettings> {
  const { data } = await apiClient.patch<ApiResponse<BookingSettings>>(
    `/branches/${branchId}/booking-settings`,
    payload,
  );
  return data.data;
}
