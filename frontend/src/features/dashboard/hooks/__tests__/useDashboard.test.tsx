import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  useDashboardStats,
  useRevenueData,
  usePopularServices,
  useKpiData,
  useLiveOperations,
  useBranchPerformance,
  useEmployeePerformance,
  useAlerts,
  useOnlineBookingStats,
} from '../useDashboard';

vi.mock('../../api/dashboard.api', () => ({
  fetchDashboardStats: vi.fn(),
  fetchRevenueData: vi.fn(),
  fetchPopularServices: vi.fn(),
  fetchKpiData: vi.fn(),
  fetchLiveOperations: vi.fn(),
  fetchBranchPerformance: vi.fn(),
  fetchEmployeePerformance: vi.fn(),
  fetchAlerts: vi.fn(),
  fetchOnlineBookingStats: vi.fn(),
}));

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
} from '../../api/dashboard.api';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useDashboardStats', () => {
  it('calls fetchDashboardStats and returns data', async () => {
    const data = { totalOrders: 100, todayOrders: 5, revenue: 5000, todayRevenue: 200, activeClients: 30, completionRate: 0.85 };
    vi.mocked(fetchDashboardStats).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useDashboardStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
    expect(fetchDashboardStats).toHaveBeenCalledWith(undefined);
  });

  it('handles error', async () => {
    vi.mocked(fetchDashboardStats).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useDashboardStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useRevenueData', () => {
  it('calls fetchRevenueData and returns data', async () => {
    const data = [{ date: '2026-01-01', revenue: 100, orders: 5 }];
    vi.mocked(fetchRevenueData).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useRevenueData(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchRevenueData).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useRevenueData(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('usePopularServices', () => {
  it('calls fetchPopularServices and returns data', async () => {
    const data = [{ name: 'Full Wash', count: 50, revenue: 2500 }];
    vi.mocked(fetchPopularServices).mockResolvedValueOnce(data);

    const { result } = renderHook(() => usePopularServices(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchPopularServices).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => usePopularServices(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useKpiData', () => {
  it('calls fetchKpiData and returns data', async () => {
    const data = { revenueToday: 200, ordersToday: 5, avgOrderDuration: 45, cancelRateToday: 0.1, activeClientsToday: 10, occupancyRate: 0.7 };
    vi.mocked(fetchKpiData).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useKpiData(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchKpiData).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useKpiData(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useLiveOperations', () => {
  it('calls fetchLiveOperations and returns data', async () => {
    const data = { inProgressCount: 3, waitingCount: 2, freeWorkPosts: 5, overdueOrders: 1 };
    vi.mocked(fetchLiveOperations).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useLiveOperations(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchLiveOperations).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useLiveOperations(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useBranchPerformance', () => {
  it('calls fetchBranchPerformance and returns data', async () => {
    const data = [{ branchId: 'b1', name: 'Main', revenue: 1000, orders: 20, avgCheck: 50, loadRate: 0.6 }];
    vi.mocked(fetchBranchPerformance).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useBranchPerformance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchBranchPerformance).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useBranchPerformance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useEmployeePerformance', () => {
  it('calls fetchEmployeePerformance and returns data', async () => {
    const data = [{ employeeId: 'e1', name: 'John', branch: 'Main', orders: 10, revenue: 500, cancelRate: 0.05 }];
    vi.mocked(fetchEmployeePerformance).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useEmployeePerformance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchEmployeePerformance).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useEmployeePerformance(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useAlerts', () => {
  it('calls fetchAlerts and returns data', async () => {
    const data = [{ type: 'LOW_STOCK', severity: 'HIGH' as const, messageKey: 'alert.lowStock', payload: {} }];
    vi.mocked(fetchAlerts).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useAlerts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchAlerts).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useAlerts(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useOnlineBookingStats', () => {
  it('calls fetchOnlineBookingStats and returns data', async () => {
    const data = { bySource: [{ source: 'web', count: 10, revenue: 500 }], total: 20, onlineCount: 10, onlineRate: 0.5 };
    vi.mocked(fetchOnlineBookingStats).mockResolvedValueOnce(data);

    const { result } = renderHook(() => useOnlineBookingStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(data);
  });

  it('handles error', async () => {
    vi.mocked(fetchOnlineBookingStats).mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useOnlineBookingStats(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
