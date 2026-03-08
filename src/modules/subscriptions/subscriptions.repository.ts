import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenantId(tenantId: string) {
    return this.prisma.subscription.findUnique({ where: { tenantId } });
  }

  async upsert(
    tenantId: string,
    data: {
      maxUsers: number;
      maxBranches: number;
      maxWorkPosts: number;
      maxServices: number;
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

  async delete(tenantId: string) {
    return this.prisma.subscription.delete({ where: { tenantId } });
  }

  /**
   * Atomically checks whether the tenant can create one more resource.
   * Runs inside a Serializable transaction to prevent TOCTOU races.
   * Returns true if the limit allows creation, throws nothing — caller decides.
   */
  async checkLimitAtomic(
    tenantId: string,
    resource: 'users' | 'branches' | 'workPosts' | 'services',
  ): Promise<{
    allowed: boolean;
    current: number;
    max: number | null;
    trialExpired?: boolean;
  }> {
    return this.prisma.$transaction(
      async (tx) => {
        const subscription = await tx.subscription.findUnique({
          where: { tenantId },
        });

        if (!subscription) {
          return { allowed: true, current: 0, max: null };
        }

        if (
          subscription.isTrial &&
          subscription.trialEndsAt &&
          subscription.trialEndsAt < new Date()
        ) {
          return { allowed: false, current: 0, max: null, trialExpired: true };
        }

        const count = await this.countResourceTx(tx, tenantId, resource);
        const max = this.getMax(subscription, resource);

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
      maxUsers: number;
      maxBranches: number;
      maxWorkPosts: number;
      maxServices: number;
    },
    resource: 'users' | 'branches' | 'workPosts' | 'services',
  ): number {
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
