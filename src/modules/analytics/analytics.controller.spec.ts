import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

const mockAnalyticsService = {
  getDashboard: jest.fn(),
  getRevenue: jest.fn(),
  getPopularServices: jest.fn(),
  getKpi: jest.fn(),
  getLiveOperations: jest.fn(),
  getBranchPerformance: jest.fn(),
  getEmployeePerformance: jest.fn(),
  getAlerts: jest.fn(),
  getOnlineBookingStats: jest.fn(),
};

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
      ],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(
        require('../../common/guards/permissions.guard').PermissionsGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  describe('getDashboard', () => {
    it('delegates to analyticsService.getDashboard with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = { orders: 42, revenue: 1000 };

      mockAnalyticsService.getDashboard.mockResolvedValue(expected);

      const result = await controller.getDashboard(tenantId, branchId, query);

      expect(mockAnalyticsService.getDashboard).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getRevenue', () => {
    it('delegates to analyticsService.getRevenue with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = { total: 5000 };

      mockAnalyticsService.getRevenue.mockResolvedValue(expected);

      const result = await controller.getRevenue(tenantId, branchId, query);

      expect(mockAnalyticsService.getRevenue).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getPopularServices', () => {
    it('delegates to analyticsService.getPopularServices with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = [{ serviceId: 'svc-1', count: 10 }];

      mockAnalyticsService.getPopularServices.mockResolvedValue(expected);

      const result = await controller.getPopularServices(
        tenantId,
        branchId,
        query,
      );

      expect(mockAnalyticsService.getPopularServices).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getKpi', () => {
    it('delegates to analyticsService.getKpi with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = { avgOrderValue: 150 };

      mockAnalyticsService.getKpi.mockResolvedValue(expected);

      const result = await controller.getKpi(tenantId, branchId, query);

      expect(mockAnalyticsService.getKpi).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getLiveOperations', () => {
    it('delegates to analyticsService.getLiveOperations with tenantId and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const expected = { activeOrders: 3 };

      mockAnalyticsService.getLiveOperations.mockResolvedValue(expected);

      const result = await controller.getLiveOperations(tenantId, branchId);

      expect(mockAnalyticsService.getLiveOperations).toHaveBeenCalledWith(
        tenantId,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getBranchPerformance', () => {
    it('delegates to analyticsService.getBranchPerformance with tenantId and query only', async () => {
      const tenantId = 'tenant-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = [{ branchId: 'branch-1', revenue: 2000 }];

      mockAnalyticsService.getBranchPerformance.mockResolvedValue(expected);

      const result = await controller.getBranchPerformance(tenantId, query);

      expect(mockAnalyticsService.getBranchPerformance).toHaveBeenCalledWith(
        tenantId,
        query,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getEmployeePerformance', () => {
    it('delegates to analyticsService.getEmployeePerformance with tenantId, branchId and query', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = [{ employeeId: 'emp-1', ordersCompleted: 20 }];

      mockAnalyticsService.getEmployeePerformance.mockResolvedValue(expected);

      const result = await controller.getEmployeePerformance(
        tenantId,
        branchId,
        query,
      );

      expect(mockAnalyticsService.getEmployeePerformance).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getAlerts', () => {
    it('delegates to analyticsService.getAlerts with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = [{ type: 'warning', message: 'Low capacity' }];

      mockAnalyticsService.getAlerts.mockResolvedValue(expected);

      const result = await controller.getAlerts(tenantId, branchId, query);

      expect(mockAnalyticsService.getAlerts).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('getOnlineBookingStats', () => {
    it('delegates to analyticsService.getOnlineBookingStats with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: AnalyticsQueryDto = {} as AnalyticsQueryDto;
      const expected = { bookings: 15, conversionRate: 0.75 };

      mockAnalyticsService.getOnlineBookingStats.mockResolvedValue(expected);

      const result = await controller.getOnlineBookingStats(
        tenantId,
        branchId,
        query,
      );

      expect(mockAnalyticsService.getOnlineBookingStats).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });
});
