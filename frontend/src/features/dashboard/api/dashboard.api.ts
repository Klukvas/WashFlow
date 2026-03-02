import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';

export interface DashboardStats {
  totalOrders: number;
  todayOrders: number;
  revenue: number;
  todayRevenue: number;
  activeClients: number;
  completionRate: number;
}

export interface RevenueData {
  date: string;
  revenue: number;
  orders: number;
}

export interface PopularService {
  name: string;
  count: number;
  revenue: number;
}

export async function fetchDashboardStats(params?: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<DashboardStats> {
  const { data } = await apiClient.get<ApiResponse<DashboardStats>>(
    '/analytics/dashboard',
    { params },
  );
  return data.data;
}

export async function fetchRevenueData(params?: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<RevenueData[]> {
  const { data } = await apiClient.get<ApiResponse<RevenueData[]>>(
    '/analytics/revenue',
    { params },
  );
  return data.data;
}

export async function fetchPopularServices(params?: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<PopularService[]> {
  const { data } = await apiClient.get<ApiResponse<PopularService[]>>(
    '/analytics/services',
    { params },
  );
  return data.data;
}

export interface KpiData {
  revenueToday: number;
  ordersToday: number;
  avgOrderDuration: number;
  cancelRateToday: number;
  activeClientsToday: number;
  occupancyRate: number;
}

export interface LiveOperations {
  inProgressCount: number;
  waitingCount: number;
  freeWorkPosts: number;
  overdueOrders: number;
}

export interface BranchPerformance {
  branchId: string;
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  loadRate: number;
}

export interface EmployeePerformance {
  employeeId: string;
  name: string;
  branch: string;
  orders: number;
  revenue: number;
  cancelRate: number;
}

export interface DashboardAlert {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  messageKey: string;
  payload: Record<string, unknown>;
}

export interface OnlineBookingStats {
  bySource: Array<{ source: string; count: number; revenue: number }>;
  total: number;
  onlineCount: number;
  onlineRate: number;
}

type DateRangeParams = {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export async function fetchKpiData(params?: DateRangeParams): Promise<KpiData> {
  const { data } = await apiClient.get<ApiResponse<KpiData>>('/analytics/kpi', {
    params,
  });
  return data.data;
}

export async function fetchLiveOperations(params?: {
  branchId?: string;
}): Promise<LiveOperations> {
  const { data } = await apiClient.get<ApiResponse<LiveOperations>>(
    '/analytics/live',
    { params },
  );
  return data.data;
}

export async function fetchBranchPerformance(
  params?: DateRangeParams,
): Promise<BranchPerformance[]> {
  const { data } = await apiClient.get<ApiResponse<BranchPerformance[]>>(
    '/analytics/branches',
    { params },
  );
  return data.data;
}

export async function fetchEmployeePerformance(
  params?: DateRangeParams,
): Promise<EmployeePerformance[]> {
  const { data } = await apiClient.get<ApiResponse<EmployeePerformance[]>>(
    '/analytics/employees',
    { params },
  );
  return data.data;
}

export async function fetchAlerts(
  params?: DateRangeParams,
): Promise<DashboardAlert[]> {
  const { data } = await apiClient.get<ApiResponse<DashboardAlert[]>>(
    '/analytics/alerts',
    { params },
  );
  return data.data;
}

export async function fetchOnlineBookingStats(
  params?: DateRangeParams,
): Promise<OnlineBookingStats> {
  const { data } = await apiClient.get<ApiResponse<OnlineBookingStats>>(
    '/analytics/online-booking',
    { params },
  );
  return data.data;
}
