import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';

export interface AnalyticsParams {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface RevenueDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface ServiceStat {
  name: string;
  count: number;
  revenue: number;
}

export async function fetchRevenue(
  params?: AnalyticsParams,
): Promise<RevenueDataPoint[]> {
  const { data } = await apiClient.get<ApiResponse<RevenueDataPoint[]>>(
    '/analytics/revenue',
    { params },
  );
  return data.data;
}

export async function fetchServiceStats(
  params?: AnalyticsParams,
): Promise<ServiceStat[]> {
  const { data } = await apiClient.get<ApiResponse<ServiceStat[]>>(
    '/analytics/services',
    { params },
  );
  return data.data;
}
