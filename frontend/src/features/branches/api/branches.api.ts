import { z } from 'zod';
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
import type { WorkPostQueryParams } from '@/features/work-posts/api/work-posts.api';
export type { WorkPostQueryParams } from '@/features/work-posts/api/work-posts.api';

export interface BranchQueryParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeDeleted?: boolean;
}

export interface CreateBranchPayload {
  timezone?: string;
  name: string;
  address?: string;
  phone?: string;
}

export interface UpdateBranchPayload {
  timezone?: string;
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

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const days = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .refine((v) => new Set(v).size === v.length);
const savedSettings = z
  .object({
    id: z.uuid(),
    tenantId: z.uuid(),
    branchId: z.uuid(),
    workingHoursStart: time,
    workingHoursEnd: time,
    workingDays: days,
    slotDurationMinutes: z.number().int().min(5).max(480),
    bufferTimeMinutes: z.number().int().min(0).max(60),
    maxAdvanceBookingDays: z.number().int().min(1).max(365),
    allowOnlineBooking: z.boolean(),
  })
  .refine((v) => v.workingHoursStart < v.workingHoursEnd);
const fallbackSettings = z
  .object({
    workStartTime: time,
    workEndTime: time,
    slotDuration: z.number().int().positive(),
    workingDays: days,
    maxAdvanceBookingDays: z.number().int().positive(),
    requireConfirmation: z.boolean(),
  })
  .strict();

export function normalizeBookingSettings(
  value: unknown,
  branchId: string,
): BookingSettings | null {
  if (value === null || fallbackSettings.safeParse(value).success) return null;
  const result = savedSettings.parse(value);
  if (result.branchId !== branchId) throw new Error('Invalid branch settings');
  return result;
}

export async function fetchBranchBookingSettings(
  branchId: string,
): Promise<BookingSettings | null> {
  const { data } = await apiClient.get<ApiResponse<BookingSettings | null>>(
    `/branches/${branchId}/booking-settings`,
  );
  return normalizeBookingSettings(data.data, branchId);
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

/** Branches are the paginated resource; setup and quick handoff require every page. */
export async function fetchAllBranches(): Promise<Branch[]> {
  let all: Branch[] = [];
  let expectedTotal: number | undefined;
  for (let page = 1; page <= 1000; page += 1) {
    const result = await fetchBranches({ page, limit: 100 });
    const meta = result.meta;
    if (
      !Array.isArray(result.items) ||
      !meta ||
      !Number.isInteger(meta.totalPages) ||
      meta.totalPages < 0 ||
      meta.totalPages > 1000 ||
      meta.page !== page ||
      !Number.isInteger(meta.total) ||
      meta.total < 0 ||
      result.items.length > 100 ||
      (expectedTotal !== undefined && expectedTotal !== meta.total)
    )
      throw new Error('Invalid branch list');
    expectedTotal = meta.total;
    all = [...all, ...result.items];
    if (page >= meta.totalPages) {
      if (
        all.length !== meta.total ||
        new Set(all.map((b) => b.id)).size !== all.length
      )
        throw new Error('Invalid branch list');
      return all;
    }
    if (result.items.length === 0) throw new Error('Invalid branch list');
  }
  throw new Error('Invalid branch list');
}
