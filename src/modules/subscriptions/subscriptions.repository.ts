import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ResourceKey } from './plan.constants';
import { SubscriptionStatus } from './plan.constants';

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string) {
    return this.prisma.subscription.findUnique({ where: { tenantId } });
  }

  async findByTenantIdWithAddons(tenantId: string) {
    return this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { addons: true },
    });
  }

  async findByPaddleSubscriptionId(paddleSubscriptionId: string) {
    return this.prisma.subscription.findFirst({
      where: { paddleSubscriptionId },
      include: { addons: true },
    });
  }

  async upsert(
    tenantId: string,
    data: {
      maxUsers?: number | null;
      maxBranches?: number | null;
      maxWorkPosts?: number | null;
      maxServices?: number | null;
      isTrial?: boolean;
      trialEndsAt?: Date | null;
    },
  ) {
    return this.prisma.subscription.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
  }

  async update(
    tenantId: string,
    data: Prisma.SubscriptionUpdateInput,
  ) {
    return this.prisma.subscription.update({
      where: { tenantId },
      data,
    });
  }

  async updateLimits(
    tenantId: string,
    limits: {
      maxUsers: number | null;
      maxBranches: number | null;
      maxWorkPosts: number | null;
      maxServices: number | null;
    },
  ) {
    return this.prisma.subscription.update({
      where: { tenantId },
      data: limits,
    });
  }

  async delete(tenantId: string) {
    return this.prisma.subscription.delete({ where: { tenantId } });
  }

  async upsertAddon(
    subscriptionId: string,
    resource: ResourceKey,
    quantity: number,
    paddlePriceId?: string,
  ) {
    return this.prisma.subscriptionAddon.upsert({
      where: {
        subscriptionId_resource: { subscriptionId, resource },
      },
      create: { subscriptionId, resource, quantity, paddlePriceId },
      update: { quantity, paddlePriceId },
    });
  }

  async deleteAddon(subscriptionId: string, resource: ResourceKey) {
    return this.prisma.subscriptionAddon.deleteMany({
      where: { subscriptionId, resource },
    });
  }

  async findAddons(subscriptionId: string) {
    return this.prisma.subscriptionAddon.findMany({
      where: { subscriptionId },
    });
  }

  /**
   * Atomically checks whether the tenant can create one more resource.
   * Runs inside a Serializable transaction to prevent TOCTOU races.
   */
  async checkLimitAtomic(
    tenantId: string,
    resource: 'users' | 'branches' | 'workPosts' | 'services',
  ): Promise<{
    allowed: boolean;
    current: number;
    max: number | null;
    trialExpired?: boolean;
    subscriptionInactive?: boolean;
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        const subscription = await tx.subscription.findUnique({
          where: { tenantId },
        });

        if (!subscription) {
          return { allowed: true, current: 0, max: null };
        }

        // Check trial expiry
        if (
          subscription.isTrial &&
          subscription.trialEndsAt &&
          subscription.trialEndsAt < new Date()
        ) {
          return { allowed: false, current: 0, max: null, trialExpired: true };
        }

        // Check subscription status — deny creation for cancelled (past effective date) or paused
        if (subscription.status === SubscriptionStatus.CANCELLED) {
          const now = new Date();
          if (
            !subscription.cancelEffectiveAt ||
            subscription.cancelEffectiveAt <= now
          ) {
            return {
              allowed: false,
              current: 0,
              max: null,
              subscriptionInactive: true,
            };
          }
        }

        if (subscription.status === SubscriptionStatus.PAUSED) {
          return {
            allowed: false,
            current: 0,
            max: null,
            subscriptionInactive: true,
          };
        }

        const count = await this.countResourceTx(tx, tenantId, resource);
        const max = this.getMax(subscription, resource);

        // null max = unlimited → always allowed
        if (max === null) {
          return { allowed: true, current: count, max: null };
        }

        return { allowed: count < max, current: count, max };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  /** Count active (non-deleted) resources for a tenant — usable outside transactions. */
  async countUsers(tenantId: string): Promise<number> {
    return this.prisma.user.count({
      where: { tenantId, deletedAt: null },
    });
  }

  async countBranches(tenantId: string): Promise<number> {
    return this.prisma.branch.count({
      where: { tenantId, deletedAt: null },
    });
  }

  async countWorkPosts(tenantId: string): Promise<number> {
    return this.prisma.workPost.count({
      where: { tenantId, deletedAt: null },
    });
  }

  async countServices(tenantId: string): Promise<number> {
    return this.prisma.service.count({
      where: { tenantId, deletedAt: null },
    });
  }

  /** Count inside a transaction client. */
  private async countResourceTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    resource: 'users' | 'branches' | 'workPosts' | 'services',
  ): Promise<number> {
    const where = { tenantId, deletedAt: null };
    switch (resource) {
      case 'users':
        return tx.user.count({ where });
      case 'branches':
        return tx.branch.count({ where });
      case 'workPosts':
        return tx.workPost.count({ where });
      case 'services':
        return tx.service.count({ where });
      default: {
        const _exhaustive: never = resource;
        throw new Error(`Unknown resource: ${_exhaustive}`);
      }
    }
  }

  private getMax(
    subscription: {
      maxUsers: number | null;
      maxBranches: number | null;
      maxWorkPosts: number | null;
      maxServices: number | null;
    },
    resource: 'users' | 'branches' | 'workPosts' | 'services',
  ): number | null {
    switch (resource) {
      case 'users':
        return subscription.maxUsers;
      case 'branches':
        return subscription.maxBranches;
      case 'workPosts':
        return subscription.maxWorkPosts;
      case 'services':
        return subscription.maxServices;
      default: {
        const _exhaustive: never = resource;
        throw new Error(`Unknown resource: ${_exhaustive}`);
      }
    }
  }
}
