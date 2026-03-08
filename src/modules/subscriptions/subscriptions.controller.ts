import {
  Controller,
  Get,
  Put,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SuperAdminGuard } from '../../common/guards/superadmin.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { UpsertSubscriptionDto } from './dto/upsert-subscription.dto';

/** Tenant-scoped: only users with tenants.read can view subscription usage. */
@Controller('subscription')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionUsageController {
  constructor(private readonly limitsService: SubscriptionLimitsService) {}

  @Get('usage')
  @Permissions('tenants.read')
  getUsage(@CurrentTenant() tenantId: string) {
    return this.limitsService.getUsage(tenantId);
  }
}

/** Admin-scoped: superAdmin manages tenant subscriptions. */
@Controller('tenants/:tenantId/subscription')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SubscriptionAdminController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  findByTenant(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.subscriptionsService.findByTenantId(tenantId);
  }

  @Put()
  upsert(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() dto: UpsertSubscriptionDto,
  ) {
    return this.subscriptionsService.upsert(tenantId, dto);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.subscriptionsService.delete(tenantId);
  }
}
