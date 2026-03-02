import { Injectable } from '@nestjs/common';
import { AnalyticsRepository } from './analytics.repository';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly analyticsRepo: AnalyticsRepository) {}

  async getDashboard(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getDashboardStats(tenantId, query, branchId);
  }

  async getRevenue(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getRevenueByStatus(tenantId, query, branchId);
  }

  async getPopularServices(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getPopularServices(tenantId, query, branchId);
  }

  async getKpi(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getKpi(tenantId, query, branchId);
  }

  async getLiveOperations(tenantId: string, branchId: string | null = null) {
    return this.analyticsRepo.getLiveOperations(tenantId, branchId);
  }

  async getBranchPerformance(tenantId: string, query: AnalyticsQueryDto) {
    return this.analyticsRepo.getBranchPerformance(tenantId, query);
  }

  async getEmployeePerformance(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getEmployeePerformance(tenantId, query, branchId);
  }

  async getAlerts(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getAlerts(tenantId, query, branchId);
  }

  async getOnlineBookingStats(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    return this.analyticsRepo.getOnlineBookingStats(tenantId, query, branchId);
  }
}
