import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsRepository } from './subscriptions.repository';
import { PaddleService, PaddleApiError } from './paddle.service';
import { PaddlePriceCacheService } from './paddle-price-cache.service';
import { UpsertSubscriptionDto } from './dto/upsert-subscription.dto';
import { ChangePlanDto } from './dto/change-plan.dto';
import { ManageAddonDto } from './dto/manage-addon.dto';
import {
  PlanTier,
  SubscriptionStatus,
  PLAN_CATALOG,
  DEFAULT_PADDLE_PRICE_IDS,
  DEFAULT_ADDON_PADDLE_PRICE_IDS,
  calculateEffectiveLimit,
  isDowngrade,
  type ResourceKey,
} from './plan.constants';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly paddleService: PaddleService,
    private readonly priceCacheService: PaddlePriceCacheService,
    private readonly config: ConfigService,
  ) {}

  async findByTenantId(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return subscription;
  }

  async getBillingDetails(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.paddleSubscriptionId) {
      return null;
    }

    return this.paddleService.getSubscriptionBilling(
      subscription.paddleSubscriptionId,
    );
  }

  async getTransactionHistory(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.paddleSubscriptionId) {
      return [];
    }

    return this.paddleService.getTransactionHistory(
      subscription.paddleSubscriptionId,
    );
  }

  async getPlanCatalog() {
    return this.priceCacheService.getCachedCatalog();
  }

  async createCheckout(tenantId: string, dto: ChangePlanDto, email: string) {
    const subscription =
      await this.subscriptionsRepo.findByTenantIdWithAddons(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.paddleSubscriptionId) {
      throw new BadRequestException(
        'Already subscribed. Use plan change endpoint to switch plans.',
      );
    }

    const plan = PLAN_CATALOG.find((p) => p.tier === dto.planTier);
    if (!plan) {
      throw new BadRequestException('Invalid plan tier');
    }

    const items = this.buildAllPaddleItems(
      subscription,
      dto.planTier as PlanTier,
      dto.billingInterval,
    );

    const { transactionId } =
      await this.paddleService.createCheckoutTransaction({
        items,
        customerId: subscription.paddleCustomerId ?? undefined,
        customerEmail: email,
        customData: { tenantId },
      });

    return {
      transactionId,
      clientToken: this.config.get<string>('paddle.clientToken', ''),
    };
  }

  async changePlan(tenantId: string, dto: ChangePlanDto) {
    const subscription =
      await this.subscriptionsRepo.findByTenantIdWithAddons(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.paddleSubscriptionId) {
      throw new BadRequestException(
        'No active Paddle subscription. Use checkout to subscribe first.',
      );
    }

    if (subscription.planTier === PlanTier.TRIAL) {
      throw new BadRequestException(
        'Cannot change plan on a trial. Use checkout to subscribe first.',
      );
    }

    const newTier = dto.planTier;

    if (isDowngrade(subscription.planTier, newTier)) {
      await this.validateDowngrade(
        tenantId,
        newTier,
        subscription.addons.map((a) => ({
          resource: a.resource as ResourceKey,
          quantity: a.quantity,
        })),
      );
    }

    const items = this.buildAllPaddleItems(
      subscription,
      newTier,
      dto.billingInterval,
    );

    await this.paddleService.updateSubscription(
      subscription.paddleSubscriptionId,
      {
        items,
        prorationBillingMode: 'prorated_immediately',
      },
    );

    // If switching plan on a cancelled subscription, clear cancellation state
    if (subscription.status === SubscriptionStatus.CANCELLED) {
      await this.subscriptionsRepo.update(tenantId, {
        status: SubscriptionStatus.ACTIVE,
        cancelledAt: null,
        cancelEffectiveAt: null,
      });
    }

    return {
      message: 'Plan change initiated. Updates will arrive via webhook.',
    };
  }

  async manageAddon(tenantId: string, dto: ManageAddonDto) {
    const subscription =
      await this.subscriptionsRepo.findByTenantIdWithAddons(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.planTier === PlanTier.TRIAL) {
      throw new BadRequestException(
        'Add-ons are not available on trial. Please subscribe first.',
      );
    }

    const resource = dto.resource as ResourceKey;
    const addonPriceId = this.getAddonPriceId(resource);

    // Call Paddle FIRST (if linked) — only write to DB after Paddle confirms success
    if (subscription.paddleSubscriptionId) {
      // Build items with the new addon quantities applied speculatively
      const speculativeAddons = subscription.addons
        .filter((a) => a.resource !== resource)
        .map((a) => ({ resource: a.resource, quantity: a.quantity }));

      if (dto.quantity > 0) {
        speculativeAddons.push({ resource, quantity: dto.quantity });
      }

      const items = this.buildAllPaddleItems({
        planTier: subscription.planTier,
        billingInterval: subscription.billingInterval,
        addons: speculativeAddons,
      });

      await this.paddleService.updateSubscription(
        subscription.paddleSubscriptionId,
        {
          items,
          prorationBillingMode: 'prorated_immediately',
        },
      );
    }

    // Paddle succeeded (or no Paddle subscription) — now write to DB
    if (dto.quantity === 0) {
      await this.subscriptionsRepo.deleteAddon(subscription.id, resource);
    } else {
      await this.subscriptionsRepo.upsertAddon(
        subscription.id,
        resource,
        dto.quantity,
        addonPriceId,
      );
    }

    await this.recalculateEffectiveLimits(tenantId);

    return this.subscriptionsRepo.findByTenantIdWithAddons(tenantId);
  }

  async previewPlanChange(tenantId: string, dto: ChangePlanDto) {
    const subscription =
      await this.subscriptionsRepo.findByTenantIdWithAddons(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.paddleSubscriptionId) {
      const plan = PLAN_CATALOG.find((p) => p.tier === dto.planTier);
      if (!plan) {
        throw new BadRequestException('Invalid plan tier');
      }

      const price =
        dto.billingInterval === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;

      return {
        source: 'static' as const,
        amount: String(price * 100),
        currency: 'USD',
        interval: dto.billingInterval,
      };
    }

    const items = this.buildAllPaddleItems(
      subscription,
      dto.planTier as PlanTier,
      dto.billingInterval,
    );

    return this.paddleService.previewSubscriptionUpdate(
      subscription.paddleSubscriptionId,
      {
        items,
        prorationBillingMode: 'prorated_immediately',
      },
    );
  }

  async cancelSubscription(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.paddleSubscriptionId) {
      throw new BadRequestException('No active Paddle subscription to cancel.');
    }

    if (subscription.status === SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is already cancelled.');
    }

    try {
      await this.paddleService.cancelSubscription(
        subscription.paddleSubscriptionId,
        'next_billing_period',
      );
    } catch (error) {
      // If Paddle already has a pending cancellation, sync our DB and succeed
      if (
        error instanceof PaddleApiError &&
        error.errorCode === 'subscription_locked_pending_changes'
      ) {
        this.logger.warn(
          `Cancel for tenant ${tenantId}: Paddle already has pending cancellation, syncing DB`,
        );
      } else {
        throw error;
      }
    }

    // Optimistically update local DB so the UI reflects cancellation immediately.
    // The webhook will later confirm/update with exact effective date.
    await this.subscriptionsRepo.update(tenantId, {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelEffectiveAt: subscription.currentPeriodEnd ?? new Date(),
    });

    return {
      message:
        'Cancellation requested. Access continues until the end of the current billing period.',
    };
  }

  async reactivateSubscription(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (!subscription.paddleSubscriptionId) {
      throw new BadRequestException('No Paddle subscription to reactivate.');
    }

    if (subscription.status !== SubscriptionStatus.CANCELLED) {
      throw new BadRequestException('Subscription is not cancelled.');
    }

    // Only allow reactivation before the effective cancellation date
    if (
      subscription.cancelEffectiveAt &&
      subscription.cancelEffectiveAt <= new Date()
    ) {
      throw new BadRequestException(
        'Cancellation period has ended. Please create a new subscription.',
      );
    }

    await this.paddleService.reactivateSubscription(
      subscription.paddleSubscriptionId,
    );

    await this.subscriptionsRepo.update(tenantId, {
      status: SubscriptionStatus.ACTIVE,
      cancelledAt: null,
      cancelEffectiveAt: null,
    });

    return { message: 'Subscription reactivated successfully.' };
  }

  /** Called by PaddleWebhookService after processing subscription events. */
  async recalculateEffectiveLimits(tenantId: string) {
    const subscription =
      await this.subscriptionsRepo.findByTenantIdWithAddons(tenantId);
    if (!subscription) return;

    const addonQuantities: Record<ResourceKey, number> = {
      branches: 0,
      workPosts: 0,
      users: 0,
      services: 0,
    };

    for (const addon of subscription.addons) {
      const resource = addon.resource as ResourceKey;
      if (resource in addonQuantities) {
        addonQuantities[resource] = addon.quantity;
      }
    }

    const limits = {
      maxBranches: calculateEffectiveLimit(
        subscription.planTier,
        'branches',
        addonQuantities.branches,
      ),
      maxWorkPosts: calculateEffectiveLimit(
        subscription.planTier,
        'workPosts',
        addonQuantities.workPosts,
      ),
      maxUsers: calculateEffectiveLimit(
        subscription.planTier,
        'users',
        addonQuantities.users,
      ),
      maxServices: calculateEffectiveLimit(
        subscription.planTier,
        'services',
        addonQuantities.services,
      ),
    };

    await this.subscriptionsRepo.updateLimits(tenantId, limits);
  }

  async upsert(tenantId: string, dto: UpsertSubscriptionDto) {
    const [usersCount, branchesCount, workPostsCount, servicesCount] =
      await Promise.all([
        this.subscriptionsRepo.countUsers(tenantId),
        this.subscriptionsRepo.countBranches(tenantId),
        this.subscriptionsRepo.countWorkPosts(tenantId),
        this.subscriptionsRepo.countServices(tenantId),
      ]);

    const violations: string[] = [];
    if (dto.maxUsers < usersCount) {
      violations.push(`users: ${usersCount} active, limit ${dto.maxUsers}`);
    }
    if (dto.maxBranches < branchesCount) {
      violations.push(
        `branches: ${branchesCount} active, limit ${dto.maxBranches}`,
      );
    }
    if (dto.maxWorkPosts < workPostsCount) {
      violations.push(
        `work posts: ${workPostsCount} active, limit ${dto.maxWorkPosts}`,
      );
    }
    if (dto.maxServices < servicesCount) {
      violations.push(
        `services: ${servicesCount} active, limit ${dto.maxServices}`,
      );
    }

    if (violations.length > 0) {
      throw new ConflictException(
        `Cannot set limits below current usage: ${violations.join('; ')}`,
      );
    }

    return this.subscriptionsRepo.upsert(tenantId, { ...dto });
  }

  async delete(tenantId: string) {
    const subscription = await this.subscriptionsRepo.findByTenantId(tenantId);
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    return this.subscriptionsRepo.delete(tenantId);
  }

  private async validateDowngrade(
    tenantId: string,
    newTier: PlanTier,
    addons: Array<{ resource: ResourceKey; quantity: number }>,
  ) {
    const [usersCount, branchesCount, workPostsCount, servicesCount] =
      await Promise.all([
        this.subscriptionsRepo.countUsers(tenantId),
        this.subscriptionsRepo.countBranches(tenantId),
        this.subscriptionsRepo.countWorkPosts(tenantId),
        this.subscriptionsRepo.countServices(tenantId),
      ]);

    const addonQuantities: Record<ResourceKey, number> = {
      branches: 0,
      workPosts: 0,
      users: 0,
      services: 0,
    };
    for (const a of addons) {
      addonQuantities[a.resource] = a.quantity;
    }

    const violations: string[] = [];
    const resources: Array<{
      key: ResourceKey;
      count: number;
      label: string;
    }> = [
      { key: 'users', count: usersCount, label: 'users' },
      { key: 'branches', count: branchesCount, label: 'branches' },
      { key: 'workPosts', count: workPostsCount, label: 'work posts' },
      { key: 'services', count: servicesCount, label: 'services' },
    ];

    for (const { key, count, label } of resources) {
      const effectiveLimit = calculateEffectiveLimit(
        newTier,
        key,
        addonQuantities[key],
      );
      if (effectiveLimit !== null && count > effectiveLimit) {
        violations.push(
          `${label}: ${count} active, new limit ${effectiveLimit}`,
        );
      }
    }

    if (violations.length > 0) {
      throw new ConflictException(
        `Cannot downgrade: current usage exceeds new plan limits: ${violations.join('; ')}`,
      );
    }
  }

  private getPriceId(tier: string, interval: string): string {
    const key = `${String(tier).toLowerCase()}_${String(interval).toLowerCase()}`;

    // Config overrides take priority over defaults
    const configPriceIds =
      this.config.get<Record<string, string>>('paddle.priceIds') ?? {};
    const priceId = configPriceIds[key] ?? DEFAULT_PADDLE_PRICE_IDS[key];

    if (!priceId) {
      throw new BadRequestException(`No Paddle price ID configured for ${key}`);
    }

    return priceId;
  }

  private getAddonPriceId(resource: ResourceKey): string {
    const configAddonPriceIds =
      this.config.get<Record<string, string>>('paddle.addonPriceIds') ?? {};
    const priceId =
      configAddonPriceIds[resource] ?? DEFAULT_ADDON_PADDLE_PRICE_IDS[resource];
    if (!priceId) {
      throw new BadRequestException(
        `No Paddle price ID configured for addon: ${resource}`,
      );
    }
    return priceId;
  }

  /**
   * Builds the complete Paddle items array (plan + addons) for a subscription update.
   * When changing plans, overrideTier and overrideInterval MUST both be provided
   * to avoid using stale values from the subscription object.
   */
  private buildAllPaddleItems(
    subscription: {
      planTier: string;
      billingInterval?: string | null;
      addons: Array<{ resource: string; quantity: number }>;
    },
    overrideTier?: string,
    overrideInterval?: string,
  ): Array<{ priceId: string; quantity: number }> {
    const tier = overrideTier ?? subscription.planTier;
    const interval =
      overrideInterval ?? subscription.billingInterval ?? 'MONTHLY';

    const items: Array<{ priceId: string; quantity: number }> = [
      { priceId: this.getPriceId(tier, interval), quantity: 1 },
    ];

    for (const addon of subscription.addons) {
      if (addon.quantity > 0) {
        const resource = addon.resource as ResourceKey;
        items.push({
          priceId: this.getAddonPriceId(resource),
          quantity: addon.quantity,
        });
      }
    }

    return items;
  }
}
