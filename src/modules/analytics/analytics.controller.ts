import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @Permissions('analytics.view')
  getDashboard(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getDashboard(tenantId, query, branchId);
  }

  @Get('revenue')
  @Permissions('analytics.view')
  getRevenue(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getRevenue(tenantId, query, branchId);
  }

  @Get('services')
  @Permissions('analytics.view')
  getPopularServices(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getPopularServices(tenantId, query, branchId);
  }

  @Get('kpi')
  @Permissions('analytics.view')
  getKpi(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getKpi(tenantId, query, branchId);
  }

  @Get('live')
  @Permissions('analytics.view')
  getLiveOperations(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
  ) {
    return this.analyticsService.getLiveOperations(tenantId, branchId);
  }

  @Get('branches')
  @Permissions('analytics.view')
  getBranchPerformance(
    @CurrentTenant() tenantId: string,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getBranchPerformance(tenantId, query);
  }

  @Get('employees')
  @Permissions('analytics.view')
  getEmployeePerformance(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getEmployeePerformance(
      tenantId,
      query,
      branchId,
    );
  }

  @Get('alerts')
  @Permissions('analytics.view')
  getAlerts(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getAlerts(tenantId, query, branchId);
  }

  @Get('online-booking')
  @Permissions('analytics.view')
  getOnlineBookingStats(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: AnalyticsQueryDto,
  ) {
    return this.analyticsService.getOnlineBookingStats(
      tenantId,
      query,
      branchId,
    );
  }
}
