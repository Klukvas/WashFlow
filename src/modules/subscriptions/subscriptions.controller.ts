import {
  Controller,
  Get,
  Post,
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
import { ChangePlanDto } from './dto/change-plan.dto';
import { ManageAddonDto } from './dto/manage-addon.dto';

/** Tenant-scoped: only users with tenants.read can view subscription usage. */
@Controller('subscription')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionUsageController {
  constructor(
    private readonly limitsService: SubscriptionLimitsService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  @Get('usage')
  @Permissions('tenants.read')
  getUsage(@CurrentTenant() tenantId: string) {
    return this.limitsService.getUsage(tenantId);
  }

  @Get('plans')
  @Permissions('tenants.read')
  getPlanCatalog() {
    return this.subscriptionsService.getPlanCatalog();
  }

  @Post('checkout')
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @CurrentTenant() tenantId: string,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptionsService.createCheckout(tenantId, dto);
  }

  @Post('change-plan')
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  changePlan(@CurrentTenant() tenantId: string, @Body() dto: ChangePlanDto) {
    return this.subscriptionsService.changePlan(tenantId, dto);
  }

  @Post('addons')
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  manageAddon(@CurrentTenant() tenantId: string, @Body() dto: ManageAddonDto) {
    return this.subscriptionsService.manageAddon(tenantId, dto);
  }

  @Post('preview')
  @Permissions('tenants.read')
  @HttpCode(HttpStatus.OK)
  previewPlanChange(
    @CurrentTenant() tenantId: string,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptionsService.previewPlanChange(tenantId, dto);
  }

  @Post('cancel')
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  cancelSubscription(@CurrentTenant() tenantId: string) {
    return this.subscriptionsService.cancelSubscription(tenantId);
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
