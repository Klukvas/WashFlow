import { useQuery } from '@tanstack/react-query';
import {
  fetchRevenue,
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
