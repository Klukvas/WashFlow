import { Injectable, ForbiddenException } from '@nestjs/common';
import { SubscriptionsRepository } from './subscriptions.repository';

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

  /**
   * Atomically checks whether the tenant can create one more resource.
   * Uses Serializable transaction to prevent TOCTOU races.
   * No subscription row → no limits enforced (backward compat).
   */
  async checkLimit(tenantId: string, resource: Resource): Promise<void> {
    const result = await this.subscriptionsRepo.checkLimitAtomic(
      tenantId,
      resource,
    );

    if (result.trialExpired) {
      throw new ForbiddenException('Trial has expired');
    }

    if (!result.allowed) {
      throw new ForbiddenException(
        `Subscription limit reached: maximum ${result.max} ${RESOURCE_LABELS[resource]} allowed`,
      );
    }
  }

  /**
   * Returns subscription limits + current usage for all resources.
   * Only exposes limit fields — Paddle billing fields are stripped.
   */
  async getUsage(tenantId: string) {
    const [
      subscription,
      usersCount,
      branchesCount,
      workPostsCount,
      servicesCount,
    ] = await Promise.all([
      this.subscriptionsRepo.findByTenantId(tenantId),
      this.subscriptionsRepo.countUsers(tenantId),
      this.subscriptionsRepo.countBranches(tenantId),
      this.subscriptionsRepo.countWorkPosts(tenantId),
      this.subscriptionsRepo.countServices(tenantId),
    ]);

    return {
      subscription: subscription
        ? {
            maxUsers: subscription.maxUsers,
            maxBranches: subscription.maxBranches,
            maxWorkPosts: subscription.maxWorkPosts,
            maxServices: subscription.maxServices,
            isTrial: subscription.isTrial,
            trialEndsAt: subscription.trialEndsAt?.toISOString() ?? null,
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
