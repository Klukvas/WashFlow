import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchRevenue, fetchServiceStats } from '../analytics.api';
import { fetchDashboardStats as fetchDashboard } from '@/features/dashboard/api/dashboard.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '@/shared/api/client';

describe('analytics.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchDashboard calls GET /analytics/dashboard', async () => {
    const mockData = {
      totalOrders: 100,
      todayOrders: 5,
      revenue: 50000,
      todayRevenue: 2500,
      activeClients: 42,
      completionRate: 0.95,
    };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockData },
    });

    const result = await fetchDashboard({ branchId: 'b1' });

    expect(apiClient.get).toHaveBeenCalledWith('/analytics/dashboard', {
      params: { branchId: 'b1' },
    });
    expect(result.totalOrders).toBe(100);
  });

  it('fetchRevenue calls GET /analytics/revenue', async () => {
    const mockData = [{ date: '2026-03-01', revenue: 5000, orders: 10 }];
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockData },
    });

    const result = await fetchRevenue({
      dateFrom: '2026-03-01',
      dateTo: '2026-03-07',
    });

    expect(apiClient.get).toHaveBeenCalledWith('/analytics/revenue', {
      params: { dateFrom: '2026-03-01', dateTo: '2026-03-07' },
    });
    expect(result).toHaveLength(1);
  });

  it('fetchServiceStats calls GET /analytics/services', async () => {
    const mockData = [{ name: 'Basic Wash', count: 50, revenue: 7500 }];
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockData },
    });

    const result = await fetchServiceStats();

    expect(apiClient.get).toHaveBeenCalledWith('/analytics/services', {
      params: undefined,
    });
    expect(result[0].name).toBe('Basic Wash');
  });
});
