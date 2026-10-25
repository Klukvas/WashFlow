import { useQuery } from '@tanstack/react-query';
import {
  fetchRevenue,
  fetchDaySummary,
  fetchServiceStats,
  type AnalyticsParams,
} from '../api/analytics.api';
import { fetchDashboardStats } from '@/features/dashboard/api/dashboard.api';

export function useAnalyticsDashboard(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', 'dashboard', params],
    queryFn: () => fetchDashboardStats(params),
    staleTime: 60 * 1000,
  });
}

export function useAnalyticsRevenue(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', 'revenue', params],
    queryFn: () => fetchRevenue(params),
    staleTime: 60 * 1000,
  });
}

export function useAnalyticsServices(params?: AnalyticsParams) {
  return useQuery({
    queryKey: ['analytics', 'services', params],
    queryFn: () => fetchServiceStats(params),
    staleTime: 60 * 1000,
  });
}

export function useDaySummary(branchId: string, date: string) {
  return useQuery({
    queryKey: ['day-summary', branchId, date],
    queryFn: () => fetchDaySummary(branchId, date),
    enabled: !!branchId && !!date,
  });
}
