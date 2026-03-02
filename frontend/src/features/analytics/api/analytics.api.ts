import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';

export interface AnalyticsParams {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardData {
  totalOrders: number;
  todayOrders: number;
  revenue: number;
  todayRevenue: number;
  activeClients: number;
  completionRate: number;
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

export async function fetchDashboard(params?: AnalyticsParams): Promise<DashboardData> {
  const { data } = await apiClient.get<ApiResponse<DashboardData>>('/analytics/dashboard', { params });
  return data.data;
}

export async function fetchRevenue(params?: AnalyticsParams): Promise<RevenueDataPoint[]> {
  const { data } = await apiClient.get<ApiResponse<RevenueDataPoint[]>>('/analytics/revenue', { params });
  return data.data;
}

export async function fetchServiceStats(params?: AnalyticsParams): Promise<ServiceStat[]> {
  const { data } = await apiClient.get<ApiResponse<ServiceStat[]>>('/analytics/services', { params });
  return data.data;
}
