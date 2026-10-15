import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SubscriptionsRepository,
  ResourceLimitResult,
} from './subscriptions.repository';

type Resource = 'users' | 'branches' | 'workPosts' | 'services';

const RESOURCE_LABELS: Record<Resource, string> = {
  users: 'users',
  branches: 'branches',
  workPosts: 'work posts',
  services: 'services',
};

@Injectable()
export class SubscriptionLimitsService {
  constructor(private readonly subscriptionsRepo: SubscriptionsRepository) {}

  /** Preview only; creation/restoration must run inside withResourceLimit. */
  async checkLimit(tenantId: string, resource: Resource): Promise<void> {
    this.assertAllowed(
      await this.subscriptionsRepo.checkLimitAtomic(tenantId, resource),
      resource,
    );
  }

  async withResourceLimit<T>(
    tenantId: string,
    resource: Resource,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.subscriptionsRepo.withResourceLimit(
      tenantId,
      resource,
      (tx, result) => {
        this.assertAllowed(result, resource);
        return operation(tx);
      },
    );
  }

  private assertAllowed(result: ResourceLimitResult, resource: Resource): void {
    if (result.trialExpired) {
      throw new ForbiddenException('Trial has expired');
    }

    if (result.subscriptionInactive) {
      throw new ForbiddenException(
        'Subscription is inactive. Please renew your subscription to continue.',
      );
    }

    if (!result.allowed) {
      throw new ForbiddenException(
        `Subscription limit reached: maximum ${result.max} ${RESOURCE_LABELS[resource]} allowed`,
      );
    }
  }

  /**
   * Returns subscription limits + current usage for all resources.
   * Includes plan tier, status, and addons info.
   */
  async getUsage(tenantId: string) {
    const [
      subscription,
      usersCount,
      branchesCount,
      workPostsCount,
      servicesCount,
    ] = await Promise.all([
      this.subscriptionsRepo.findByTenantIdWithAddons(tenantId),
      this.subscriptionsRepo.countUsers(tenantId),
      this.subscriptionsRepo.countBranches(tenantId),
      this.subscriptionsRepo.countWorkPosts(tenantId),
      this.subscriptionsRepo.countServices(tenantId),
    ]);

    return {
      subscription: subscription
        ? {
            planTier: subscription.planTier,
            status: subscription.status,
            billingInterval: subscription.billingInterval,
            maxUsers: subscription.maxUsers,
            maxBranches: subscription.maxBranches,
            maxWorkPosts: subscription.maxWorkPosts,
            maxServices: subscription.maxServices,
            isTrial: subscription.isTrial,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
            currentPeriodEnd:
              subscription.currentPeriodEnd?.toISOString() ?? null,
            cancelEffectiveAt:
              subscription.cancelEffectiveAt?.toISOString() ?? null,
            hasActiveSubscription: !!subscription.paddleSubscriptionId,
            addons: subscription.addons.map((a) => ({
              resource: a.resource,
              quantity: a.quantity,
            })),
          }
        : null,
      usage: {
        users: { current: usersCount, max: subscription?.maxUsers ?? null },
        branches: {
          current: branchesCount,
          max: subscription?.maxBranches ?? null,
        },
        workPosts: {
          current: workPostsCount,
          max: subscription?.maxWorkPosts ?? null,
        },
        services: {
          current: servicesCount,
          max: subscription?.maxServices ?? null,
        },
      },
    };
  }
}
