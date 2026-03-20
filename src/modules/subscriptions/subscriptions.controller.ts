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
import { ConfigService } from '@nestjs/config';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SuperAdminGuard } from '../../common/guards/superadmin.guard';
import { PaymentsEnabledGuard } from '../../common/guards/payments-enabled.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { UpsertSubscriptionDto } from './dto/upsert-subscription.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ManageAddonDto } from './dto/manage-addon.dto';

/**
 * Lightweight subscription status — available to ALL authenticated users.
 * Returns only isTrial + trialEndsAt so the frontend SubscriptionGate
 * can block expired-trial users regardless of their permissions.
 */
@Controller('subscription')
export class SubscriptionStatusController {
  constructor(
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  async getStatus(@CurrentTenant() tenantId: string) {
    const paymentsEnabled =
      this.config.get<boolean>('features.paymentsEnabled') ?? false;
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      return { isTrial: false, trialEndsAt: null, paymentsEnabled };
    }
    return {
      isTrial: subscription.isTrial,
      trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
      paymentsEnabled,
    };
  }
}

/** Tenant-scoped: only users with tenants.read can view subscription usage. */
@Controller('subscription')
@UseGuards(PermissionsGuard)
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

  @Get('billing')
  @Permissions('tenants.read')
  getBilling(@CurrentTenant() tenantId: string) {
    return this.subscriptionsService.getBillingDetails(tenantId);
  }

  @Get('transactions')
  @Permissions('tenants.read')
  getTransactions(@CurrentTenant() tenantId: string) {
    return this.subscriptionsService.getTransactionHistory(tenantId);
  }

  @Get('plans')
  @Permissions('tenants.read')
  getPlanCatalog() {
    return this.subscriptionsService.getPlanCatalog();
  }

  @Post('checkout')
  @UseGuards(PaymentsEnabledGuard)
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  createCheckout(
    @CurrentTenant() tenantId: string,
    @CurrentUser('email') email: string,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptionsService.createCheckout(tenantId, dto, email);
  }

  @Post('change-plan')
  @UseGuards(PaymentsEnabledGuard)
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  changePlan(@CurrentTenant() tenantId: string, @Body() dto: ChangePlanDto) {
    return this.subscriptionsService.changePlan(tenantId, dto);
  }

  @Post('addons')
  @UseGuards(PaymentsEnabledGuard)
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
  @UseGuards(PaymentsEnabledGuard)
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  cancelSubscription(@CurrentTenant() tenantId: string) {
    return this.subscriptionsService.cancelSubscription(tenantId);
  }

  @Post('reactivate')
  @UseGuards(PaymentsEnabledGuard)
  @Permissions('tenants.update')
  @HttpCode(HttpStatus.OK)
  reactivateSubscription(@CurrentTenant() tenantId: string) {
    return this.subscriptionsService.reactivateSubscription(tenantId);
  }
}

/** Admin-scoped: superAdmin manages tenant subscriptions. */
@Controller('tenants/:tenantId/subscription')
@UseGuards(SuperAdminGuard)
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
