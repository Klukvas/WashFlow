import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchDayRange } from '../../common/utils/branch-day.util';
import { DaySummaryQueryDto } from './dto/day-summary-query.dto';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  /**
   * If the user's JWT contains a branchId, reject any query param
   * that tries to request data for a different branch.
   */
  private validateBranchScope(
    userBranchId: string | null,
    query: AnalyticsQueryDto,
  ): void {
    if (
      userBranchId !== null &&
      query.branchId &&
      query.branchId !== userBranchId
    ) {
      throw new ForbiddenException(
        'You do not have access to the requested branch',
      );
    }
  }

  async getDaySummary(
    tenantId: string,
    query: DaySummaryQueryDto,
    userBranchId: string | null = null,
  ) {
    this.validateBranchScope(userBranchId, query);
    const branchId = userBranchId ?? query.branchId;
    if (!branchId)
      throw new BadRequestException('A single branchId is required');
    const branch = await this.analyticsRepo.findDaySummaryBranch(
      tenantId,
      branchId,
    );
    if (!branch) throw new NotFoundException('Branch not found');
    const timezone = branch.timezone ?? 'UTC';
    const range = branchDayRange(query.date, timezone);
    const { sales, receipts } = await this.analyticsRepo.getDaySummary(
      tenantId,
      branchId,
      range,
    );
    const zero = () => new Prisma.Decimal(0);
    const completed = sales.find((row) => row.status === 'COMPLETED');
    return {
      branchId,
      date: query.date,
      timezone,
      range,
      sales: {
        orderCount: sales.reduce((sum, row) => sum + row._count._all, 0),
        completedCount: completed?._count._all ?? 0,
        scheduledTotal: sales
          .filter((row) => !['CANCELLED', 'NO_SHOW'].includes(row.status))
          .reduce((sum, row) => sum.plus(row._sum.totalPrice ?? 0), zero())
          .toFixed(2),
        completedTotal: (completed?._sum.totalPrice ?? zero()).toFixed(2),
        byStatus: sales.map((row) => ({
          status: row.status,
          count: row._count._all,
          total: (row._sum.totalPrice ?? zero()).toFixed(2),
        })),
      },
      receipts: {
        count: receipts.reduce((sum, row) => sum + row._count._all, 0),
        total: receipts
          .reduce((sum, row) => sum.plus(row._sum.amount ?? 0), zero())
          .toFixed(2),
        byMethod: receipts.map((row) => ({
          method: row.method,
          count: row._count._all,
          total: (row._sum.amount ?? zero()).toFixed(2),
        })),
      },
    };
  }

  async getDashboard(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getDashboardStats(tenantId, query, branchId);
  }

  async getRevenue(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getRevenueByStatus(tenantId, query, branchId);
  }

  async getPopularServices(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getPopularServices(tenantId, query, branchId);
  }

  async getKpi(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getKpi(tenantId, query, branchId);
  }

  async getLiveOperations(tenantId: string, branchId: string | null = null) {
    return this.analyticsRepo.getLiveOperations(tenantId, branchId);
  }

  async getBranchPerformance(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getBranchPerformance(tenantId, query, branchId);
  }

  async getEmployeePerformance(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getEmployeePerformance(tenantId, query, branchId);
  }

  async getAlerts(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getAlerts(tenantId, query, branchId);
  }

  async getOnlineBookingStats(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    this.validateBranchScope(branchId, query);
    return this.analyticsRepo.getOnlineBookingStats(tenantId, query, branchId);
  }
}
