import type { OrderStatus, PaymentMethod } from '@/shared/types/enums';
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

export type DaySummaryData = {
  branchId: string;
  date: string;
  timezone: string;
  range: { start: string; end: string };
  sales: {
    orderCount: number;
    completedCount: number;
    scheduledTotal: string;
    completedTotal: string;
    byStatus: { status: OrderStatus; count: number; total: string }[];
  };
  receipts: {
    count: number;
    total: string;
    byMethod: { method: PaymentMethod; count: number; total: string }[];
  };
};
export async function fetchDaySummary(
  branchId: string,
  date: string,
): Promise<DaySummaryData> {
  const { data } = await apiClient.get<ApiResponse<DaySummaryData>>(
    '/analytics/day-summary',
    { params: { branchId, date } },
  );
  return data.data;
}
