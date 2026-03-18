import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsRepository } from './analytics.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('AnalyticsRepository', () => {
  let repo: AnalyticsRepository;

  const tenantId = 'tenant-1';
  const query = {} as any;

  const tenantClient = {
    order: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn(),
      groupBy: jest.fn(),
    },
    orderService: {
      groupBy: jest.fn(),
    },
    service: {
      findMany: jest.fn(),
    },
    workPost: {
      count: jest.fn(),
    },
    branch: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.order.count.mockResolvedValue(0);
    tenantClient.order.aggregate.mockResolvedValue({
      _sum: { totalPrice: null },
    });
    tenantClient.order.findMany.mockResolvedValue([]);
    tenantClient.order.groupBy.mockResolvedValue([]);
    tenantClient.orderService.groupBy.mockResolvedValue([]);
    tenantClient.service.findMany.mockResolvedValue([]);
    tenantClient.workPost.count.mockResolvedValue(0);
    tenantClient.branch.findMany.mockResolvedValue([]);
    tenantClient.user.findMany.mockResolvedValue([]);
    tenantClient.$queryRaw.mockResolvedValue([{ avg: null }]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<AnalyticsRepository>(AnalyticsRepository);
  });

  // ─── getDashboardStats ───────────────────────────────────────────────────────

  describe('getDashboardStats', () => {
    it('returns dashboard stats with computed completion rate', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(10) // totalOrders
        .mockResolvedValueOnce(8) // completedOrders
        .mockResolvedValueOnce(2); // cancelledOrders
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 1000 },
      });

      const result = await repo.getDashboardStats(tenantId, query);

      expect(tenantClient.order.count).toHaveBeenCalledTimes(3);
      expect(tenantClient.order.aggregate).toHaveBeenCalledTimes(1);
      expect(result.totalOrders).toBe(10);
      expect(result.completedOrders).toBe(8);
      expect(result.cancelledOrders).toBe(2);
      expect(result.totalRevenue).toBe(1000);
      expect(result.completionRate).toBe(80);
    });

    it('returns 0 completionRate and 0 totalRevenue when no orders', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      const result = await repo.getDashboardStats(tenantId, query);
      expect(result.completionRate).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });

    it('applies JWT branchId filter when provided', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      await repo.getDashboardStats(tenantId, query, 'branch-1');

      const countArgs = tenantClient.order.count.mock.calls[0][0];
      expect(countArgs.where.branchId).toBe('branch-1');
    });

    it('applies query branchId when no JWT branchId', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      await repo.getDashboardStats(tenantId, {
        ...query,
        branchId: 'branch-2',
      });

      const countArgs = tenantClient.order.count.mock.calls[0][0];
      expect(countArgs.where.branchId).toBe('branch-2');
    });

    it('applies dateFrom filter to scheduledStart', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      await repo.getDashboardStats(tenantId, {
        dateFrom: '2026-01-01',
      });

      const countArgs = tenantClient.order.count.mock.calls[0][0];
      expect(countArgs.where.scheduledStart).toBeDefined();
      expect(countArgs.where.scheduledStart.gte).toEqual(
        new Date('2026-01-01'),
      );
    });

    it('applies dateTo filter to scheduledStart', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      await repo.getDashboardStats(tenantId, {
        dateTo: '2026-12-31',
      });

      const countArgs = tenantClient.order.count.mock.calls[0][0];
      expect(countArgs.where.scheduledStart).toBeDefined();
      expect(countArgs.where.scheduledStart.lte).toEqual(
        new Date('2026-12-31'),
      );
    });

    it('applies both dateFrom and dateTo filters', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      await repo.getDashboardStats(tenantId, {
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
      });

      const countArgs = tenantClient.order.count.mock.calls[0][0];
      expect(countArgs.where.scheduledStart.gte).toEqual(
        new Date('2026-01-01'),
      );
      expect(countArgs.where.scheduledStart.lte).toEqual(
        new Date('2026-12-31'),
      );
    });
  });

  // ─── getRevenueByStatus ──────────────────────────────────────────────────────

  describe('getRevenueByStatus', () => {
    it('groups orders by status and returns revenue', async () => {
      const mockGrouped = [
        { status: 'COMPLETED', _sum: { totalPrice: 500 }, _count: { id: 3 } },
      ];
      tenantClient.order.groupBy.mockResolvedValue(mockGrouped);

      const result = await repo.getRevenueByStatus(tenantId, query);

      expect(tenantClient.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ by: ['status'] }),
      );
      expect(result).toEqual(mockGrouped);
    });

    it('returns empty array when no orders', async () => {
      tenantClient.order.groupBy.mockResolvedValue([]);
      const result = await repo.getRevenueByStatus(tenantId, query);
      expect(result).toEqual([]);
    });
  });

  // ─── getPopularServices ──────────────────────────────────────────────────────

  describe('getPopularServices', () => {
    it('returns empty array when no orders', async () => {
      tenantClient.order.findMany.mockResolvedValue([]);
      const result = await repo.getPopularServices(tenantId, query);
      expect(result).toEqual([]);
    });

    it('aggregates services across orders and sorts by count descending', async () => {
      // order.findMany returns order IDs (select: { id: true })
      tenantClient.order.findMany.mockResolvedValue([
        { id: 'order-1' },
        { id: 'order-2' },
      ]);
      // orderService.groupBy returns pre-aggregated data
      tenantClient.orderService.groupBy.mockResolvedValue([
        { serviceId: 'svc-1', _sum: { quantity: 5, price: 250 } },
        { serviceId: 'svc-2', _sum: { quantity: 1, price: 30 } },
      ]);
      // service.findMany returns service names
      tenantClient.service.findMany.mockResolvedValue([
        { id: 'svc-1', name: 'Wash' },
        { id: 'svc-2', name: 'Wax' },
      ]);

      const result = await repo.getPopularServices(tenantId, query);

      expect(result[0].serviceId).toBe('svc-1');
      expect(result[0].count).toBe(5);
      expect(result[0].revenue).toBe(250);
      expect(result[1].serviceId).toBe('svc-2');
      expect(result[1].count).toBe(1);
    });
  });

  // ─── getLiveOperations ───────────────────────────────────────────────────────

  describe('getLiveOperations', () => {
    it('returns live operations with correct freeWorkPosts computation', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(3) // inProgressCount
        .mockResolvedValueOnce(2) // waitingCount
        .mockResolvedValueOnce(1); // overdueOrders
      tenantClient.workPost.count.mockResolvedValue(5);
      tenantClient.order.findMany.mockResolvedValue([
        { workPostId: 'wp-1' },
        { workPostId: 'wp-2' },
      ]);

      const result = await repo.getLiveOperations(tenantId);

      expect(result.inProgressCount).toBe(3);
      expect(result.waitingCount).toBe(2);
      expect(result.overdueOrders).toBe(1);
      expect(result.freeWorkPosts).toBe(3); // 5 active - 2 busy
    });

    it('returns 0 freeWorkPosts when all posts are busy', async () => {
      tenantClient.order.count.mockResolvedValue(2);
      tenantClient.workPost.count.mockResolvedValue(2);
      tenantClient.order.findMany.mockResolvedValue([
        { workPostId: 'wp-1' },
        { workPostId: 'wp-2' },
      ]);

      const result = await repo.getLiveOperations(tenantId);
      expect(result.freeWorkPosts).toBe(0);
    });

    it('applies branchId filter when provided', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.workPost.count.mockResolvedValue(0);
      tenantClient.order.findMany.mockResolvedValue([]);

      await repo.getLiveOperations(tenantId, 'branch-1');

      const countArgs = tenantClient.order.count.mock.calls[0][0];
      expect(countArgs.where.branchId).toBe('branch-1');
    });
  });

  // ─── getBranchPerformance ────────────────────────────────────────────────────

  describe('getBranchPerformance', () => {
    it('returns performance metrics for each branch', async () => {
      tenantClient.branch.findMany.mockResolvedValue([
        { id: 'branch-1', name: 'Branch A' },
      ]);
      tenantClient.order.groupBy.mockResolvedValue([
        { branchId: 'branch-1', _sum: { totalPrice: 1000 }, _count: { id: 5 } },
      ]);

      const result = await repo.getBranchPerformance(tenantId, query);

      expect(result).toHaveLength(1);
      expect(result[0].branchId).toBe('branch-1');
      expect(result[0].name).toBe('Branch A');
      expect(result[0].revenue).toBe(1000);
      expect(result[0].orders).toBe(5);
      expect(result[0].avgCheck).toBe(200);
      expect(result[0].loadRate).toBe(100);
    });

    it('returns 0 avgCheck when branch has no orders', async () => {
      tenantClient.branch.findMany.mockResolvedValue([
        { id: 'branch-1', name: 'Branch A' },
        { id: 'branch-2', name: 'Branch B' },
      ]);
      tenantClient.order.groupBy.mockResolvedValue([
        { branchId: 'branch-1', _sum: { totalPrice: 500 }, _count: { id: 5 } },
      ]);

      const result = await repo.getBranchPerformance(tenantId, query);
      const branchB = result.find((r) => r.branchId === 'branch-2');
      expect(branchB?.avgCheck).toBe(0);
      expect(branchB?.orders).toBe(0);
    });

    it('returns empty array when no branches exist', async () => {
      tenantClient.branch.findMany.mockResolvedValue([]);
      tenantClient.order.groupBy.mockResolvedValue([]);

      const result = await repo.getBranchPerformance(tenantId, query);
      expect(result).toEqual([]);
    });
  });

  // ─── getEmployeePerformance ──────────────────────────────────────────────────

  describe('getEmployeePerformance', () => {
    it('returns empty array when no completed orders exist', async () => {
      tenantClient.order.groupBy.mockResolvedValue([]);
      const result = await repo.getEmployeePerformance(tenantId, query);
      expect(result).toEqual([]);
    });

    it('returns performance data mapped from orders and users', async () => {
      tenantClient.order.groupBy
        .mockResolvedValueOnce([
          {
            createdById: 'user-1',
            _sum: { totalPrice: 500 },
            _count: { id: 3 },
          },
        ])
        .mockResolvedValueOnce([]); // no cancellations
      tenantClient.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          firstName: 'John',
          lastName: 'Doe',
          branch: { name: 'Branch A' },
        },
      ]);

      const result = await repo.getEmployeePerformance(tenantId, query);

      expect(result).toHaveLength(1);
      expect(result[0].employeeId).toBe('user-1');
      expect(result[0].name).toBe('John Doe');
      expect(result[0].branch).toBe('Branch A');
      expect(result[0].orders).toBe(3);
      expect(result[0].revenue).toBe(500);
      expect(result[0].cancelRate).toBe(0);
    });

    it('computes cancel rate correctly when cancellations exist', async () => {
      tenantClient.order.groupBy
        .mockResolvedValueOnce([
          {
            createdById: 'user-1',
            _sum: { totalPrice: 300 },
            _count: { id: 3 },
          },
        ])
        .mockResolvedValueOnce([{ createdById: 'user-1', _count: { id: 1 } }]);
      tenantClient.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          firstName: 'Jane',
          lastName: 'Smith',
          branch: { name: 'Branch B' },
        },
      ]);

      const result = await repo.getEmployeePerformance(tenantId, query);
      // 1 cancelled / (3 completed + 1 cancelled) = 25%
      expect(result[0].cancelRate).toBe(25);
    });
  });

  // ─── getAlerts ───────────────────────────────────────────────────────────────

  describe('getAlerts', () => {
    it('returns empty alerts when there are no concerning metrics', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: null },
      });

      const result = await repo.getAlerts(tenantId, query);
      expect(result).toEqual([]);
    });

    it('generates CRITICAL cancel rate alert when cancel rate exceeds 40%', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(10) // ordersToday
        .mockResolvedValueOnce(5) // cancelledToday (50%)
        .mockResolvedValueOnce(0) // thisWeekOrders
        .mockResolvedValueOnce(0); // lastWeekOrders
      tenantClient.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } })
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } });

      const result = await repo.getAlerts(tenantId, query);
      const alert = result.find((a) => a.type === 'HIGH_CANCEL_RATE');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('CRITICAL');
    });

    it('generates HIGH cancel rate alert when cancel rate is 21-40%', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(10) // ordersToday
        .mockResolvedValueOnce(3) // cancelledToday (30%)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      tenantClient.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } })
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } });

      const result = await repo.getAlerts(tenantId, query);
      const alert = result.find((a) => a.type === 'HIGH_CANCEL_RATE');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('HIGH');
    });

    it('generates revenue drop alert when current period revenue drops >20% vs previous', async () => {
      tenantClient.order.count.mockResolvedValue(0);
      tenantClient.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 700 } }) // currentRevenue
        .mockResolvedValueOnce({ _sum: { totalPrice: 1000 } }); // prevRevenue (30% drop)

      const result = await repo.getAlerts(tenantId, query);
      const alert = result.find((a) => a.type === 'REVENUE_DROP');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('MEDIUM');
    });

    it('generates BOOKING_DECLINE alert when decline exceeds 30%', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(0) // ordersToday
        .mockResolvedValueOnce(0) // cancelledToday
        .mockResolvedValueOnce(5) // thisWeekOrders
        .mockResolvedValueOnce(10); // lastWeekOrders (50% decline)
      tenantClient.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } })
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } });

      const result = await repo.getAlerts(tenantId, query);
      const alert = result.find((a) => a.type === 'BOOKING_DECLINE');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('MEDIUM');
    });

    it('generates HIGH severity BOOKING_DECLINE alert when decline exceeds 60%', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(0) // ordersToday
        .mockResolvedValueOnce(0) // cancelledToday
        .mockResolvedValueOnce(2) // thisWeekOrders
        .mockResolvedValueOnce(10); // lastWeekOrders (80% decline)
      tenantClient.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } })
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } });

      const result = await repo.getAlerts(tenantId, query);
      const alert = result.find((a) => a.type === 'BOOKING_DECLINE');
      expect(alert).toBeDefined();
      expect(alert?.severity).toBe('HIGH');
    });

    it('does not generate BOOKING_DECLINE when decline is under 30%', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(0) // ordersToday
        .mockResolvedValueOnce(0) // cancelledToday
        .mockResolvedValueOnce(8) // thisWeekOrders
        .mockResolvedValueOnce(10); // lastWeekOrders (20% decline)
      tenantClient.order.aggregate
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } })
        .mockResolvedValueOnce({ _sum: { totalPrice: 0 } });

      const result = await repo.getAlerts(tenantId, query);
      const alert = result.find((a) => a.type === 'BOOKING_DECLINE');
      expect(alert).toBeUndefined();
    });
  });

  // ─── getOnlineBookingStats ───────────────────────────────────────────────────

  describe('getOnlineBookingStats', () => {
    it('returns online booking stats grouped by source', async () => {
      tenantClient.order.groupBy.mockResolvedValue([
        { source: 'WEB', _count: { id: 8 }, _sum: { totalPrice: 800 } },
        { source: 'INTERNAL', _count: { id: 2 }, _sum: { totalPrice: 200 } },
      ]);

      const result = await repo.getOnlineBookingStats(tenantId, query);

      expect(result.total).toBe(10);
      expect(result.onlineCount).toBe(8);
      expect(result.onlineRate).toBe(80);
      expect(result.bySource).toHaveLength(2);
    });

    it('returns 0 onlineRate when there are no orders', async () => {
      tenantClient.order.groupBy.mockResolvedValue([]);

      const result = await repo.getOnlineBookingStats(tenantId, query);
      expect(result.total).toBe(0);
      expect(result.onlineCount).toBe(0);
      expect(result.onlineRate).toBe(0);
    });

    it('returns 0 onlineCount when all orders are INTERNAL', async () => {
      tenantClient.order.groupBy.mockResolvedValue([
        { source: 'INTERNAL', _count: { id: 5 }, _sum: { totalPrice: 500 } },
      ]);

      const result = await repo.getOnlineBookingStats(tenantId, query);
      expect(result.onlineCount).toBe(0);
      expect(result.onlineRate).toBe(0);
      expect(result.total).toBe(5);
    });
  });

  // ─── getKpi ─────────────────────────────────────────────────────────────────

  describe('getKpi', () => {
    it('returns KPI data with all required fields', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(5) // ordersToday
        .mockResolvedValueOnce(1); // cancelledToday
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 500 },
      });
      tenantClient.order.findMany
        .mockResolvedValueOnce([{ clientId: 'c1' }, { clientId: 'c2' }]) // distinctClients
        .mockResolvedValueOnce([]); // completedWithTimes
      tenantClient.workPost.count.mockResolvedValue(4);

      const result = await repo.getKpi(tenantId, query);

      expect(result).toMatchObject({
        revenueToday: expect.any(Number),
        ordersToday: expect.any(Number),
        avgOrderDuration: expect.any(Number),
        cancelRateToday: expect.any(Number),
        activeClientsToday: expect.any(Number),
        occupancyRate: expect.any(Number),
      });
      expect(result.ordersToday).toBe(5);
      expect(result.activeClientsToday).toBe(2);
    });

    it('computes avgOrderDuration from completed orders with scheduledEnd', async () => {
      tenantClient.order.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);
      tenantClient.order.aggregate.mockResolvedValue({
        _sum: { totalPrice: 0 },
      });
      tenantClient.order.findMany
        .mockResolvedValueOnce([]) // distinctClients
        .mockResolvedValueOnce([
          // 60 min each
          {
            scheduledStart: new Date('2026-02-22T08:00:00Z'),
            scheduledEnd: new Date('2026-02-22T09:00:00Z'),
          },
          {
            scheduledStart: new Date('2026-02-22T10:00:00Z'),
            scheduledEnd: new Date('2026-02-22T11:00:00Z'),
          },
        ]);
      tenantClient.workPost.count.mockResolvedValue(0);
      tenantClient.$queryRaw.mockResolvedValue([{ avg: 60 }]);

      const result = await repo.getKpi(tenantId, query);
      expect(result.avgOrderDuration).toBe(60);
    });
  });
});
