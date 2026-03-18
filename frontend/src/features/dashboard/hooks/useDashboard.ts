import { useQuery } from '@tanstack/react-query';
import {
  fetchDashboardStats,
  fetchRevenueData,
  fetchPopularServices,
  fetchKpiData,
  fetchLiveOperations,
  fetchBranchPerformance,
  fetchEmployeePerformance,
  fetchAlerts,
  fetchOnlineBookingStats,
} from '../api/dashboard.api';

export function useDashboardStats(params?: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['dashboard', 'stats', params],
    queryFn: () => fetchDashboardStats(params),
    staleTime: 30 * 1000,
  });
}

export function useRevenueData(params?: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['dashboard', 'revenue', params],
    queryFn: () => fetchRevenueData(params),
    staleTime: 60 * 1000,
  });
}

export function usePopularServices(params?: {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['dashboard', 'services', params],
    queryFn: () => fetchPopularServices(params),
    staleTime: 60 * 1000,
  });
}

type DateRangeParams = {
  branchId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export function useKpiData(params?: DateRangeParams) {
  return useQuery({
    queryKey: ['dashboard', 'kpi', params],
    queryFn: () => fetchKpiData(params),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useLiveOperations(params?: { branchId?: string }) {
  return useQuery({
    queryKey: ['dashboard', 'live', params],
    queryFn: () => fetchLiveOperations(params),
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useBranchPerformance(params?: DateRangeParams) {
  return useQuery({
    queryKey: ['dashboard', 'branches', params],
    queryFn: () => fetchBranchPerformance(params),
    staleTime: 60 * 1000,
  });
}

export function useEmployeePerformance(params?: DateRangeParams) {
  return useQuery({
    queryKey: ['dashboard', 'employees', params],
    queryFn: () => fetchEmployeePerformance(params),
    staleTime: 60 * 1000,
  });
}

export function useAlerts(params?: DateRangeParams) {
  return useQuery({
    queryKey: ['dashboard', 'alerts', params],
    queryFn: () => fetchAlerts(params),
    staleTime: 60 * 1000,
  });
}

export function useOnlineBookingStats(params?: DateRangeParams) {
  return useQuery({
    queryKey: ['dashboard', 'online-booking', params],
    queryFn: () => fetchOnlineBookingStats(params),
    staleTime: 60 * 1000,
  });
}
