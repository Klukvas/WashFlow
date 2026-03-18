import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from './analytics.service';
import { AnalyticsRepository } from './analytics.repository';

const TENANT_ID = 'tenant-abc';
const BRANCH_ID = 'branch-xyz';

const makeQuery = (overrides: Record<string, unknown> = {}) => ({
  page: 1,
  limit: 20,
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  ...overrides,
});

const makeDashboardStats = () => ({
  totalOrders: 42,
  completedOrders: 38,
  cancelledOrders: 4,
  totalRevenue: 5250.0,
  newClients: 10,
});

const makeRevenueStats = () => ({
  PAID: 4800.0,
  PENDING: 350.0,
  CANCELLED: 100.0,
});

const makePopularServices = () => [
  { serviceId: 'svc-1', name: 'Full Wash', count: 20 },
  { serviceId: 'svc-2', name: 'Interior Clean', count: 15 },
];

const makeKpiData = () => ({
  revenueToday: 1200.0,
  ordersToday: 8,
  avgOrderDuration: 45.5,
  cancelRateToday: 0.125,
  activeClientsToday: 6,
  occupancyRate: 72.3,
});

const makeKpiZeros = () => ({
  revenueToday: 0,
  ordersToday: 0,
  avgOrderDuration: 0,
  cancelRateToday: 0,
  activeClientsToday: 0,
  occupancyRate: 0,
});

const makeLiveOperations = () => ({
  inProgressCount: 3,
  waitingCount: 1,
  freeWorkPosts: 2,
  overdueOrders: 0,
});

const makeBranchPerformance = () => [
  {
    branchId: 'br-1',
    name: 'Main St',
    revenue: 3200.0,
    orders: 22,
    avgCheck: 145.5,
    loadRate: 88,
  },
  {
    branchId: 'br-2',
    name: 'Park Ave',
    revenue: 1800.0,
    orders: 14,
    avgCheck: 128.6,
    loadRate: 64,
  },
];

const makeEmployeePerformance = () => [
  {
    employeeId: 'emp-1',
    name: 'Alice Smith',
    branch: 'Main St',
    orders: 12,
    revenue: 1740.0,
    cancelRate: 0.08,
  },
  {
    employeeId: 'emp-2',
    name: 'Bob Jones',
    branch: 'Park Ave',
    orders: 9,
    revenue: 1170.0,
    cancelRate: 0.0,
  },
];

const makeAlerts = () => [
  {
    type: 'HIGH_CANCEL_RATE',
    severity: 'HIGH',
    messageKey: 'dashboard.alert.highCancelRate',
    payload: { rate: '25.0' },
  },
];

const makeOnlineBookingStats = () => ({
  bySource: [
    { source: 'INTERNAL', count: 10, revenue: 1300.0 },
    { source: 'WEB', count: 4, revenue: 520.0 },
  ],
  total: 14,
  onlineCount: 4,
  onlineRate: 28.6,
});

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let analyticsRepo: {
    getDashboardStats: jest.Mock;
    getRevenueByStatus: jest.Mock;
    getPopularServices: jest.Mock;
    getKpi: jest.Mock;
    getLiveOperations: jest.Mock;
    getBranchPerformance: jest.Mock;
    getEmployeePerformance: jest.Mock;
    getAlerts: jest.Mock;
    getOnlineBookingStats: jest.Mock;
  };

  beforeEach(async () => {
    analyticsRepo = {
      getDashboardStats: jest.fn(),
      getRevenueByStatus: jest.fn(),
      getPopularServices: jest.fn(),
      getKpi: jest.fn(),
      getLiveOperations: jest.fn(),
      getBranchPerformance: jest.fn(),
      getEmployeePerformance: jest.fn(),
      getAlerts: jest.fn(),
      getOnlineBookingStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: AnalyticsRepository, useValue: analyticsRepo },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── getDashboard ─────────────────────────────────────────────────────────

  describe('getDashboard', () => {
    it('returns dashboard stats from the repository', async () => {
      const stats = makeDashboardStats();
      analyticsRepo.getDashboardStats.mockResolvedValue(stats);

      const result = await service.getDashboard(TENANT_ID, makeQuery() as any);

      expect(result).toEqual(stats);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getDashboardStats.mockResolvedValue(makeDashboardStats());

      await service.getDashboard(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getDashboardStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getDashboardStats.mockResolvedValue(makeDashboardStats());

      await service.getDashboard(TENANT_ID, query as any);

      expect(analyticsRepo.getDashboardStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getDashboardStats.mockResolvedValue(makeDashboardStats());

      await service.getDashboard(TENANT_ID, query as any, null);

      expect(analyticsRepo.getDashboardStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getDashboardStats.mockResolvedValue(makeDashboardStats());

      await service.getDashboard(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getDashboardStats).toHaveBeenCalledTimes(1);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getDashboardStats.mockRejectedValue(
        new Error('Stats query failed'),
      );

      await expect(
        service.getDashboard(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Stats query failed');
    });
  });

  // ─── getRevenue ───────────────────────────────────────────────────────────

  describe('getRevenue', () => {
    it('returns revenue breakdown from the repository', async () => {
      const revenue = makeRevenueStats();
      analyticsRepo.getRevenueByStatus.mockResolvedValue(revenue);

      const result = await service.getRevenue(TENANT_ID, makeQuery() as any);

      expect(result).toEqual(revenue);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getRevenueByStatus.mockResolvedValue(makeRevenueStats());

      await service.getRevenue(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getRevenueByStatus).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getRevenueByStatus.mockResolvedValue(makeRevenueStats());

      await service.getRevenue(TENANT_ID, query as any);

      expect(analyticsRepo.getRevenueByStatus).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getRevenueByStatus.mockResolvedValue(makeRevenueStats());

      await service.getRevenue(TENANT_ID, query as any, null);

      expect(analyticsRepo.getRevenueByStatus).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getRevenueByStatus.mockResolvedValue(makeRevenueStats());

      await service.getRevenue(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getRevenueByStatus).toHaveBeenCalledTimes(1);
    });

    it('returns an empty object when there is no revenue data', async () => {
      analyticsRepo.getRevenueByStatus.mockResolvedValue({});

      const result = await service.getRevenue(TENANT_ID, makeQuery() as any);

      expect(result).toEqual({});
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getRevenueByStatus.mockRejectedValue(
        new Error('Revenue query failed'),
      );

      await expect(
        service.getRevenue(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Revenue query failed');
    });
  });

  // ─── getPopularServices ───────────────────────────────────────────────────

  describe('getPopularServices', () => {
    it('returns the list of popular services from the repository', async () => {
      const services = makePopularServices();
      analyticsRepo.getPopularServices.mockResolvedValue(services);

      const result = await service.getPopularServices(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual(services);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getPopularServices.mockResolvedValue(makePopularServices());

      await service.getPopularServices(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getPopularServices).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getPopularServices.mockResolvedValue(makePopularServices());

      await service.getPopularServices(TENANT_ID, query as any);

      expect(analyticsRepo.getPopularServices).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getPopularServices.mockResolvedValue(makePopularServices());

      await service.getPopularServices(TENANT_ID, query as any, null);

      expect(analyticsRepo.getPopularServices).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getPopularServices.mockResolvedValue(makePopularServices());

      await service.getPopularServices(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getPopularServices).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when no services data is available', async () => {
      analyticsRepo.getPopularServices.mockResolvedValue([]);

      const result = await service.getPopularServices(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual([]);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getPopularServices.mockRejectedValue(
        new Error('Services query failed'),
      );

      await expect(
        service.getPopularServices(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Services query failed');
    });
  });

  // ─── getKpi ───────────────────────────────────────────────────────────────

  describe('getKpi', () => {
    it('returns kpi data from the repository', async () => {
      const kpi = makeKpiData();
      analyticsRepo.getKpi.mockResolvedValue(kpi);

      const result = await service.getKpi(TENANT_ID, makeQuery() as any);

      expect(result).toEqual(kpi);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getKpi.mockResolvedValue(makeKpiData());

      await service.getKpi(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getKpi).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getKpi.mockResolvedValue(makeKpiData());

      await service.getKpi(TENANT_ID, query as any);

      expect(analyticsRepo.getKpi).toHaveBeenCalledWith(TENANT_ID, query, null);
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getKpi.mockResolvedValue(makeKpiData());

      await service.getKpi(TENANT_ID, query as any, null);

      expect(analyticsRepo.getKpi).toHaveBeenCalledWith(TENANT_ID, query, null);
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getKpi.mockResolvedValue(makeKpiData());

      await service.getKpi(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getKpi).toHaveBeenCalledTimes(1);
    });

    it('returns zeros when there are no orders today', async () => {
      analyticsRepo.getKpi.mockResolvedValue(makeKpiZeros());

      const result = await service.getKpi(TENANT_ID, makeQuery() as any);

      expect(result).toEqual(makeKpiZeros());
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getKpi.mockRejectedValue(new Error('KPI query failed'));

      await expect(
        service.getKpi(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('KPI query failed');
    });
  });

  // ─── getLiveOperations ────────────────────────────────────────────────────

  describe('getLiveOperations', () => {
    it('returns live operations data from the repository', async () => {
      const live = makeLiveOperations();
      analyticsRepo.getLiveOperations.mockResolvedValue(live);

      const result = await service.getLiveOperations(TENANT_ID);

      expect(result).toEqual(live);
    });

    it('passes tenantId and branchId to the repository', async () => {
      analyticsRepo.getLiveOperations.mockResolvedValue(makeLiveOperations());

      await service.getLiveOperations(TENANT_ID, BRANCH_ID);

      expect(analyticsRepo.getLiveOperations).toHaveBeenCalledWith(
        TENANT_ID,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      analyticsRepo.getLiveOperations.mockResolvedValue(makeLiveOperations());

      await service.getLiveOperations(TENANT_ID);

      expect(analyticsRepo.getLiveOperations).toHaveBeenCalledWith(
        TENANT_ID,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      analyticsRepo.getLiveOperations.mockResolvedValue(makeLiveOperations());

      await service.getLiveOperations(TENANT_ID, null);

      expect(analyticsRepo.getLiveOperations).toHaveBeenCalledWith(
        TENANT_ID,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getLiveOperations.mockResolvedValue(makeLiveOperations());

      await service.getLiveOperations(TENANT_ID);

      expect(analyticsRepo.getLiveOperations).toHaveBeenCalledTimes(1);
    });

    it('returns zero counts when nothing is active', async () => {
      const idle = {
        inProgressCount: 0,
        waitingCount: 0,
        freeWorkPosts: 4,
        overdueOrders: 0,
      };
      analyticsRepo.getLiveOperations.mockResolvedValue(idle);

      const result = await service.getLiveOperations(TENANT_ID);

      expect(result).toEqual(idle);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getLiveOperations.mockRejectedValue(
        new Error('Live query failed'),
      );

      await expect(service.getLiveOperations(TENANT_ID)).rejects.toThrow(
        'Live query failed',
      );
    });
  });

  // ─── getBranchPerformance ─────────────────────────────────────────────────

  describe('getBranchPerformance', () => {
    it('returns branch performance data from the repository', async () => {
      const data = makeBranchPerformance();
      analyticsRepo.getBranchPerformance.mockResolvedValue(data);

      const result = await service.getBranchPerformance(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual(data);
    });

    it('passes tenantId and query to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getBranchPerformance.mockResolvedValue(
        makeBranchPerformance(),
      );

      await service.getBranchPerformance(TENANT_ID, query as any);

      expect(analyticsRepo.getBranchPerformance).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getBranchPerformance.mockResolvedValue(
        makeBranchPerformance(),
      );

      await service.getBranchPerformance(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getBranchPerformance).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when there are no branches', async () => {
      analyticsRepo.getBranchPerformance.mockResolvedValue([]);

      const result = await service.getBranchPerformance(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual([]);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getBranchPerformance.mockRejectedValue(
        new Error('Branch query failed'),
      );

      await expect(
        service.getBranchPerformance(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Branch query failed');
    });
  });

  // ─── getEmployeePerformance ───────────────────────────────────────────────

  describe('getEmployeePerformance', () => {
    it('returns employee performance data from the repository', async () => {
      const data = makeEmployeePerformance();
      analyticsRepo.getEmployeePerformance.mockResolvedValue(data);

      const result = await service.getEmployeePerformance(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual(data);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getEmployeePerformance.mockResolvedValue(
        makeEmployeePerformance(),
      );

      await service.getEmployeePerformance(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getEmployeePerformance).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getEmployeePerformance.mockResolvedValue(
        makeEmployeePerformance(),
      );

      await service.getEmployeePerformance(TENANT_ID, query as any);

      expect(analyticsRepo.getEmployeePerformance).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getEmployeePerformance.mockResolvedValue(
        makeEmployeePerformance(),
      );

      await service.getEmployeePerformance(TENANT_ID, query as any, null);

      expect(analyticsRepo.getEmployeePerformance).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getEmployeePerformance.mockResolvedValue(
        makeEmployeePerformance(),
      );

      await service.getEmployeePerformance(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getEmployeePerformance).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when there are no employees with orders', async () => {
      analyticsRepo.getEmployeePerformance.mockResolvedValue([]);

      const result = await service.getEmployeePerformance(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual([]);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getEmployeePerformance.mockRejectedValue(
        new Error('Employee query failed'),
      );

      await expect(
        service.getEmployeePerformance(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Employee query failed');
    });
  });

  // ─── getAlerts ────────────────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('returns alert list from the repository', async () => {
      const alerts = makeAlerts();
      analyticsRepo.getAlerts.mockResolvedValue(alerts);

      const result = await service.getAlerts(TENANT_ID, makeQuery() as any);

      expect(result).toEqual(alerts);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getAlerts.mockResolvedValue(makeAlerts());

      await service.getAlerts(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getAlerts).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getAlerts.mockResolvedValue(makeAlerts());

      await service.getAlerts(TENANT_ID, query as any);

      expect(analyticsRepo.getAlerts).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getAlerts.mockResolvedValue(makeAlerts());

      await service.getAlerts(TENANT_ID, query as any, null);

      expect(analyticsRepo.getAlerts).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getAlerts.mockResolvedValue(makeAlerts());

      await service.getAlerts(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getAlerts).toHaveBeenCalledTimes(1);
    });

    it('returns an empty array when there are no active alerts', async () => {
      analyticsRepo.getAlerts.mockResolvedValue([]);

      const result = await service.getAlerts(TENANT_ID, makeQuery() as any);

      expect(result).toEqual([]);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getAlerts.mockRejectedValue(
        new Error('Alerts query failed'),
      );

      await expect(
        service.getAlerts(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Alerts query failed');
    });
  });

  // ─── getOnlineBookingStats ────────────────────────────────────────────────

  describe('getOnlineBookingStats', () => {
    it('returns online booking stats from the repository', async () => {
      const stats = makeOnlineBookingStats();
      analyticsRepo.getOnlineBookingStats.mockResolvedValue(stats);

      const result = await service.getOnlineBookingStats(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual(stats);
    });

    it('passes tenantId, query and branchId to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getOnlineBookingStats.mockResolvedValue(
        makeOnlineBookingStats(),
      );

      await service.getOnlineBookingStats(TENANT_ID, query as any, BRANCH_ID);

      expect(analyticsRepo.getOnlineBookingStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('defaults branchId to null when not provided', async () => {
      const query = makeQuery();
      analyticsRepo.getOnlineBookingStats.mockResolvedValue(
        makeOnlineBookingStats(),
      );

      await service.getOnlineBookingStats(TENANT_ID, query as any);

      expect(analyticsRepo.getOnlineBookingStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('passes explicit null branchId through to the repository', async () => {
      const query = makeQuery();
      analyticsRepo.getOnlineBookingStats.mockResolvedValue(
        makeOnlineBookingStats(),
      );

      await service.getOnlineBookingStats(TENANT_ID, query as any, null);

      expect(analyticsRepo.getOnlineBookingStats).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        null,
      );
    });

    it('calls the repository exactly once', async () => {
      analyticsRepo.getOnlineBookingStats.mockResolvedValue(
        makeOnlineBookingStats(),
      );

      await service.getOnlineBookingStats(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getOnlineBookingStats).toHaveBeenCalledTimes(1);
    });

    it('returns zero online rate when all orders are internal', async () => {
      const allInternal = {
        bySource: [{ source: 'INTERNAL', count: 10, revenue: 1500.0 }],
        total: 10,
        onlineCount: 0,
        onlineRate: 0,
      };
      analyticsRepo.getOnlineBookingStats.mockResolvedValue(allInternal);

      const result = await service.getOnlineBookingStats(
        TENANT_ID,
        makeQuery() as any,
      );

      expect(result).toEqual(allInternal);
    });

    it('propagates repository errors', async () => {
      analyticsRepo.getOnlineBookingStats.mockRejectedValue(
        new Error('Booking stats query failed'),
      );

      await expect(
        service.getOnlineBookingStats(TENANT_ID, makeQuery() as any),
      ).rejects.toThrow('Booking stats query failed');
    });
  });

  // ─── isolation: mocks are reset between tests ─────────────────────────────

  describe('mock isolation', () => {
    it('does not share call state between getDashboard and getRevenue', async () => {
      analyticsRepo.getDashboardStats.mockResolvedValue(makeDashboardStats());
      analyticsRepo.getRevenueByStatus.mockResolvedValue(makeRevenueStats());

      await service.getDashboard(TENANT_ID, makeQuery() as any);

      expect(analyticsRepo.getRevenueByStatus).not.toHaveBeenCalled();
    });
  });
});
