import { Injectable, ForbiddenException } from '@nestjs/common';
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
