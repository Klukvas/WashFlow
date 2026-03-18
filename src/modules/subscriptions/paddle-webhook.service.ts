import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type Redis from 'ioredis';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import {
  SubscriptionActivatedEvent,
  SubscriptionChangedEvent,
  SubscriptionCancelledEvent,
} from '../../common/events/subscription-events';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionsService } from './subscriptions.service';
import {
  PlanTier,
  BillingInterval,
  SubscriptionStatus,
  DEFAULT_PADDLE_PRICE_IDS,
  ADDON_PRICE_ID_TO_RESOURCE,
  isUpgrade,
  type ResourceKey,
} from './plan.constants';
import { WEBHOOK_REDIS } from './subscriptions.constants';

interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  data: Record<string, unknown>;
}

/** TTL for processed webhook event IDs (24 hours) */
const IDEMPOTENCY_TTL_SECONDS = 86400;

@Injectable()
export class PaddleWebhookService implements OnModuleDestroy {
  private readonly logger = new Logger(PaddleWebhookService.name);
  private readonly webhookSecret: string;

  /** Cached plan price IDs (defaults + config overrides) */
  private readonly allPlanPriceIds: Set<string>;
  private readonly allPriceIdToKey: Record<string, string>;

  /** Cached addon reverse lookup (defaults + config overrides) */
  private readonly addonPriceIdToResource: Readonly<
    Record<string, ResourceKey>
  >;

  constructor(
    private readonly config: ConfigService,
    private readonly subscriptionsRepo: SubscriptionsRepository,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly eventDispatcher: EventDispatcherService,
    @Inject(WEBHOOK_REDIS) private readonly redis: Redis,
  ) {
    this.webhookSecret = this.config.get<string>('paddle.webhookSecret', '');

    // Cache price ID lookups at construction time
    const configPriceIds =
      this.config.get<Record<string, string>>('paddle.priceIds') ?? {};
    this.allPlanPriceIds = new Set([
      ...Object.values(DEFAULT_PADDLE_PRICE_IDS),
      ...Object.values(configPriceIds),
    ]);

    // Reverse: priceId → key (e.g. 'pri_starter_monthly' → 'starter_monthly')
    const priceIdToKey: Record<string, string> = {};
    for (const [key, value] of Object.entries(DEFAULT_PADDLE_PRICE_IDS)) {
      priceIdToKey[value] = key;
    }
    for (const [key, value] of Object.entries(configPriceIds)) {
      priceIdToKey[value] = key;
    }
    this.allPriceIdToKey = priceIdToKey;

    // Addon reverse lookup
    const configAddonPriceIds =
      this.config.get<Record<string, string>>('paddle.addonPriceIds') ?? {};
    const addonLookup: Record<string, ResourceKey> = {
      ...ADDON_PRICE_ID_TO_RESOURCE,
    };
    for (const [resource, priceId] of Object.entries(configAddonPriceIds)) {
      addonLookup[priceId] = resource as ResourceKey;
    }
    this.addonPriceIdToResource = addonLookup;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Verifies Paddle webhook signature using HMAC-SHA256.
   * Paddle-Signature header format: ts=<timestamp>;h1=<hash>
   */
  verifySignature(rawBody: string, signatureHeader: string): boolean {
    if (!this.webhookSecret) {
      const nodeEnv = this.config.get<string>('nodeEnv', 'development');
      if (nodeEnv === 'production') {
        this.logger.error(
          'PADDLE_WEBHOOK_SECRET is required in production — rejecting webhook',
        );
        return false;
      }
      this.logger.warn(
        'PADDLE_WEBHOOK_SECRET not configured — skipping verification in dev',
      );
      return true;
    }

    const parts = signatureHeader.split(';');
    const tsField = parts.find((p) => p.startsWith('ts='));
    const h1Field = parts.find((p) => p.startsWith('h1='));

    if (!tsField || !h1Field) {
      return false;
    }

    const ts = tsField.slice(3);
    const receivedHash = h1Field.slice(3);

    // Reject webhooks older than 5 minutes to prevent replay attacks
    const tsSeconds = parseInt(ts, 10);
    if (isNaN(tsSeconds) || Math.abs(Date.now() / 1000 - tsSeconds) > 300) {
      this.logger.warn('Webhook rejected — timestamp too old or invalid');
      return false;
    }

    const signedPayload = `${ts}:${rawBody}`;
    const computedHash = createHmac('sha256', this.webhookSecret)
      .update(signedPayload)
      .digest('hex');

    try {
      return timingSafeEqual(
        Buffer.from(computedHash, 'hex'),
        Buffer.from(receivedHash, 'hex'),
      );
    } catch {
      return false;
    }
  }

  async processEvent(event: PaddleWebhookEvent): Promise<void> {
    // Idempotency: SETNX returns 'OK' only if the key did not exist
    const acquired = await this.redis.set(
      event.event_id,
      '1',
      'EX',
      IDEMPOTENCY_TTL_SECONDS,
      'NX',
    );

    if (acquired === null) {
      this.logger.log(`Skipping already processed event: ${event.event_id}`);
      return;
    }

    this.logger.log(
      `Processing Paddle event: ${event.event_type} (${event.event_id})`,
    );

    try {
      await this.dispatchHandler(event);
    } catch (error) {
      // Release idempotency key so Paddle can retry on failure
      await this.redis.del(event.event_id);
      throw error;
    }
  }

  private async dispatchHandler(event: PaddleWebhookEvent): Promise<void> {
    switch (event.event_type) {
      case 'subscription.created':
        await this.handleSubscriptionCreated(event.data);
        break;
      case 'subscription.updated':
        await this.handleSubscriptionUpdated(event.data);
        break;
      case 'subscription.canceled':
        await this.handleSubscriptionCanceled(event.data);
        break;
      case 'subscription.past_due':
        await this.handleSubscriptionPastDue(event.data);
        break;
      case 'subscription.paused':
        await this.handleSubscriptionPaused(event.data);
        break;
      case 'subscription.resumed':
        await this.handleSubscriptionResumed(event.data);
        break;
      case 'transaction.completed':
        await this.handleTransactionCompleted(event.data);
        break;
      default:
        this.logger.log(`Unhandled event type: ${event.event_type}`);
    }
  }

  private extractSubscriptionId(
    data: Record<string, unknown>,
    eventType: string,
  ): string | null {
    const id = data.id;
    if (typeof id !== 'string' || !id) {
      this.logger.error(
        `${eventType} missing or invalid id in webhook payload`,
      );
      return null;
    }
    return id;
  }

  private async handleSubscriptionCreated(
    data: Record<string, unknown>,
  ): Promise<void> {
    const paddleSubscriptionId = this.extractSubscriptionId(
      data,
      'subscription.created',
    );
    if (!paddleSubscriptionId) return;

    const customerId = data.customer_id as string;
    const customData = data.custom_data as Record<string, string> | undefined;
    const tenantId = customData?.tenantId;

    if (!tenantId) {
      this.logger.error(
        `subscription.created missing tenantId in custom_data for ${paddleSubscriptionId}`,
      );
      return;
    }

    const planTier = this.extractPlanTier(data);
    const billingInterval = this.extractBillingInterval(data);

    await this.subscriptionsRepo.update(tenantId, {
      paddleSubscriptionId,
      paddleCustomerId: customerId,
      paddleStatus: 'active',
      planTier,
      billingInterval,
      status: SubscriptionStatus.ACTIVE,
      isTrial: false,
      trialEndsAt: null,
      currentPeriodStart: this.extractPeriodStart(data),
      currentPeriodEnd: this.extractPeriodEnd(data),
    });

    // Sync addon items from Paddle data
    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(
        paddleSubscriptionId,
      );
    if (subscription) {
      await this.syncAddonsFromPaddleItems(subscription.id, data);
    }

    await this.subscriptionsService.recalculateEffectiveLimits(tenantId);

    this.eventDispatcher.dispatch(
      new SubscriptionActivatedEvent(tenantId, {
        planTier,
        billingInterval: billingInterval ?? 'MONTHLY',
        paddleSubscriptionId,
      }),
    );
  }

  private async handleSubscriptionUpdated(
    data: Record<string, unknown>,
  ): Promise<void> {
    const paddleSubscriptionId = this.extractSubscriptionId(
      data,
      'subscription.updated',
    );
    if (!paddleSubscriptionId) return;

    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(
        paddleSubscriptionId,
      );

    if (!subscription) {
      this.logger.warn(
        `subscription.updated — no subscription found for ${paddleSubscriptionId}`,
      );
      return;
    }

    const previousTier = subscription.planTier;
    const newTier = this.extractPlanTier(data);
    const billingInterval = this.extractBillingInterval(data);
    const status = this.mapPaddleStatus(data.status as string);

    await this.subscriptionsRepo.update(subscription.tenantId, {
      planTier: newTier,
      billingInterval,
      status,
      paddleStatus: data.status as string,
      currentPeriodStart: this.extractPeriodStart(data),
      currentPeriodEnd: this.extractPeriodEnd(data),
    });

    // Sync addon items from Paddle data
    await this.syncAddonsFromPaddleItems(subscription.id, data);

    await this.subscriptionsService.recalculateEffectiveLimits(
      subscription.tenantId,
    );

    if (previousTier !== newTier) {
      this.eventDispatcher.dispatch(
        new SubscriptionChangedEvent(subscription.tenantId, {
          previousPlanTier: previousTier,
          newPlanTier: newTier,
          changeType: isUpgrade(previousTier, newTier)
            ? 'upgrade'
            : 'downgrade',
        }),
      );
    }
  }

  private async handleSubscriptionCanceled(
    data: Record<string, unknown>,
  ): Promise<void> {
    const paddleSubscriptionId = this.extractSubscriptionId(
      data,
      'subscription.canceled',
    );
    if (!paddleSubscriptionId) return;

    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(
        paddleSubscriptionId,
      );

    if (!subscription) {
      this.logger.warn(
        `subscription.canceled — no subscription found for ${paddleSubscriptionId}`,
      );
      return;
    }

    const effectiveAt = this.extractPeriodEnd(data);

    await this.subscriptionsRepo.update(subscription.tenantId, {
      status: SubscriptionStatus.CANCELLED,
      paddleStatus: 'canceled',
      cancelledAt: new Date(),
      cancelEffectiveAt: effectiveAt,
    });

    this.eventDispatcher.dispatch(
      new SubscriptionCancelledEvent(subscription.tenantId, {
        effectiveAt: effectiveAt?.toISOString() ?? new Date().toISOString(),
        paddleSubscriptionId,
      }),
    );
  }

  private async handleSubscriptionPastDue(
    data: Record<string, unknown>,
  ): Promise<void> {
    const paddleSubscriptionId = this.extractSubscriptionId(
      data,
      'subscription.past_due',
    );
    if (!paddleSubscriptionId) return;

    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(
        paddleSubscriptionId,
      );

    if (!subscription) return;

    await this.subscriptionsRepo.update(subscription.tenantId, {
      status: SubscriptionStatus.PAST_DUE,
      paddleStatus: 'past_due',
    });
  }

  private async handleSubscriptionPaused(
    data: Record<string, unknown>,
  ): Promise<void> {
    const paddleSubscriptionId = this.extractSubscriptionId(
      data,
      'subscription.paused',
    );
    if (!paddleSubscriptionId) return;

    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(
        paddleSubscriptionId,
      );

    if (!subscription) return;

    await this.subscriptionsRepo.update(subscription.tenantId, {
      status: SubscriptionStatus.PAUSED,
      paddleStatus: 'paused',
    });
  }

  private async handleSubscriptionResumed(
    data: Record<string, unknown>,
  ): Promise<void> {
    const paddleSubscriptionId = this.extractSubscriptionId(
      data,
      'subscription.resumed',
    );
    if (!paddleSubscriptionId) return;

    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(
        paddleSubscriptionId,
      );

    if (!subscription) return;

    await this.subscriptionsRepo.update(subscription.tenantId, {
      status: SubscriptionStatus.ACTIVE,
      paddleStatus: 'active',
    });
  }

  private async handleTransactionCompleted(
    data: Record<string, unknown>,
  ): Promise<void> {
    const subscriptionId = data.subscription_id as string | undefined;
    if (!subscriptionId) return;

    const subscription =
      await this.subscriptionsRepo.findByPaddleSubscriptionId(subscriptionId);

    if (!subscription) return;

    const billingPeriod = data.billing_period as
      | { ends_at?: string }
      | undefined;
    if (billingPeriod?.ends_at) {
      await this.subscriptionsRepo.update(subscription.tenantId, {
        currentPeriodEnd: new Date(billingPeriod.ends_at),
      });
    }
  }

  private extractPlanTier(data: Record<string, unknown>): PlanTier {
    const validTiers = new Set(Object.values(PlanTier));
    const items = data.items as
      | Array<{
          price?: { id?: string; custom_data?: { plan_tier?: string } };
        }>
      | undefined;

    // Iterate all items to find the plan item (not an addon)
    if (items) {
      for (const item of items) {
        // Check plan_tier in price metadata
        const tierFromMetadata = item.price?.custom_data?.plan_tier;
        if (tierFromMetadata && validTiers.has(tierFromMetadata as PlanTier)) {
          return tierFromMetadata as PlanTier;
        }

        // Check if price ID matches a known plan price ID (not addon)
        const priceId = item.price?.id;
        if (priceId && this.isPlanPriceId(priceId)) {
          const tier = this.extractTierFromPlanPriceId(priceId);
          if (tier) return tier;
        }
      }
    }

    // Fallback: parse from custom_data on the subscription itself
    const customData = data.custom_data as Record<string, string> | undefined;
    if (customData?.planTier && validTiers.has(customData.planTier as PlanTier)) {
      return customData.planTier as PlanTier;
    }

    return PlanTier.STARTER;
  }

  /**
   * Checks whether a Paddle price ID corresponds to a plan (not an addon).
   */
  private isPlanPriceId(priceId: string): boolean {
    return this.allPlanPriceIds.has(priceId);
  }

  /**
   * Extracts the PlanTier from a known plan price ID.
   */
  private extractTierFromPlanPriceId(priceId: string): PlanTier | null {
    const key = this.allPriceIdToKey[priceId];
    if (!key) return null;

    // key format: "starter_monthly" → extract tier name
    const tierName = key.split('_')[0].toUpperCase();
    const validTiers = new Set(Object.values(PlanTier));
    if (validTiers.has(tierName as PlanTier)) {
      return tierName as PlanTier;
    }

    this.logger.warn(
      `Could not extract plan tier from price ID key "${key}" (priceId: ${priceId})`,
    );
    return null;
  }

  /**
   * Syncs addon items from Paddle webhook data to the local DB.
   * Fetches existing addons first, then runs all upserts/deletes in a single batch.
   */
  private async syncAddonsFromPaddleItems(
    subscriptionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const items = data.items as
      | Array<{ price?: { id?: string }; quantity?: number }>
      | undefined;

    if (!items) return;

    // Collect addon upserts/deletes from Paddle payload
    const resourcesInPaddle = new Set<string>();
    const upserts: Array<{
      resource: ResourceKey;
      quantity: number;
      priceId: string;
    }> = [];
    const deletes: ResourceKey[] = [];

    for (const item of items) {
      const priceId = item.price?.id;
      if (!priceId) continue;

      const resource = this.addonPriceIdToResource[priceId];
      if (resource) {
        resourcesInPaddle.add(resource);
        const quantity = item.quantity ?? 0;
        if (quantity > 0) {
          upserts.push({ resource, quantity, priceId });
        } else {
          deletes.push(resource);
        }
      }
    }

    // Fetch existing addons to detect stale ones — before any writes
    const existingAddons =
      await this.subscriptionsRepo.findAddons(subscriptionId);
    const staleResources = existingAddons
      .filter((addon) => !resourcesInPaddle.has(addon.resource))
      .map((addon) => addon.resource as ResourceKey);

    // Run all DB writes in a single batch
    await Promise.all([
      ...upserts.map((u) =>
        this.subscriptionsRepo.upsertAddon(
          subscriptionId,
          u.resource,
          u.quantity,
          u.priceId,
        ),
      ),
      ...deletes.map((r) =>
        this.subscriptionsRepo.deleteAddon(subscriptionId, r),
      ),
      ...staleResources.map((r) =>
        this.subscriptionsRepo.deleteAddon(subscriptionId, r),
      ),
    ]);
  }

  private extractBillingInterval(
    data: Record<string, unknown>,
  ): BillingInterval | undefined {
    const billingCycle = data.billing_cycle as
      | { interval?: string }
      | undefined;

    if (billingCycle?.interval === 'year') return BillingInterval.YEARLY;
    if (billingCycle?.interval === 'month') return BillingInterval.MONTHLY;
    return undefined;
  }

  private extractPeriodStart(data: Record<string, unknown>): Date | undefined {
    const period = data.current_billing_period as
      | { starts_at?: string }
      | undefined;
    return period?.starts_at ? new Date(period.starts_at) : undefined;
  }

  private extractPeriodEnd(data: Record<string, unknown>): Date | undefined {
    const period = data.current_billing_period as
      | { ends_at?: string }
      | undefined;
    return period?.ends_at ? new Date(period.ends_at) : undefined;
  }

  private mapPaddleStatus(status: string): SubscriptionStatus {
    switch (status) {
      case 'active':
        return SubscriptionStatus.ACTIVE;
      case 'past_due':
        return SubscriptionStatus.PAST_DUE;
      case 'paused':
        return SubscriptionStatus.PAUSED;
      case 'canceled':
        return SubscriptionStatus.CANCELLED;
      case 'trialing':
        return SubscriptionStatus.TRIALING;
      default:
        this.logger.warn(
          `Unknown Paddle status "${status}" — defaulting to ACTIVE`,
        );
        return SubscriptionStatus.ACTIVE;
    }
  }
}
