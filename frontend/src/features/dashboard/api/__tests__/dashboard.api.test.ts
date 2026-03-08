import { describe, it, expect, vi, beforeEach } from 'vitest';
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
} from '../dashboard.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '@/shared/api/client';

describe('dashboard.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchDashboardStats calls GET /analytics/dashboard', async () => {
    const mock = { totalOrders: 50, todayOrders: 3, revenue: 10000, todayRevenue: 500, activeClients: 20, completionRate: 0.9 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mock } });

    const result = await fetchDashboardStats({ branchId: 'b1' });
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/dashboard', { params: { branchId: 'b1' } });
    expect(result.totalOrders).toBe(50);
  });

  it('fetchRevenueData calls GET /analytics/revenue', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const result = await fetchRevenueData();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/revenue', { params: undefined });
    expect(result).toEqual([]);
  });

  it('fetchPopularServices calls GET /analytics/services', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [{ name: 'Wash', count: 10, revenue: 1000 }] } });
    const result = await fetchPopularServices();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/services', { params: undefined });
    expect(result).toHaveLength(1);
  });

  it('fetchKpiData calls GET /analytics/kpi', async () => {
    const mock = { revenueToday: 1000, ordersToday: 5, avgOrderDuration: 45, cancelRateToday: 0.1, activeClientsToday: 3, occupancyRate: 0.7 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mock } });
    const result = await fetchKpiData();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/kpi', { params: undefined });
    expect(result.revenueToday).toBe(1000);
  });

  it('fetchLiveOperations calls GET /analytics/live', async () => {
    const mock = { inProgressCount: 2, waitingCount: 1, freeWorkPosts: 3, overdueOrders: 0 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mock } });
    const result = await fetchLiveOperations({ branchId: 'b1' });
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/live', { params: { branchId: 'b1' } });
    expect(result.inProgressCount).toBe(2);
  });

  it('fetchBranchPerformance calls GET /analytics/branches', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const result = await fetchBranchPerformance();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/branches', { params: undefined });
    expect(result).toEqual([]);
  });

  it('fetchEmployeePerformance calls GET /analytics/employees', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: [] } });
    const result = await fetchEmployeePerformance();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/employees', { params: undefined });
    expect(result).toEqual([]);
  });

  it('fetchAlerts calls GET /analytics/alerts', async () => {
    const mock = [{ type: 'overdue', severity: 'HIGH', messageKey: 'alert.overdue', payload: {} }];
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mock } });
    const result = await fetchAlerts();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/alerts', { params: undefined });
    expect(result).toHaveLength(1);
  });

  it('fetchOnlineBookingStats calls GET /analytics/online-booking', async () => {
    const mock = { bySource: [], total: 10, onlineCount: 3, onlineRate: 0.3 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: mock } });
    const result = await fetchOnlineBookingStats();
    expect(apiClient.get).toHaveBeenCalledWith('/analytics/online-booking', { params: undefined });
    expect(result.onlineRate).toBe(0.3);
  });
});
