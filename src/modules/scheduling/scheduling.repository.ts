import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class SchedulingRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  /**
   * Row-level lock on overlapping orders for a work post.
   * Must be called within an interactive transaction.
   */
  async lockOverlappingSlots(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workPostId: string,
    start: Date,
    end: Date,
  ) {
    return tx.$queryRaw`
      SELECT id FROM orders
      WHERE "tenantId" = ${tenantId}
        AND "workPostId" = ${workPostId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        AND "scheduledStart" < ${end}
        AND "scheduledEnd" > ${start}
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
  }

  /**
   * Count overlapping orders (used after lock is acquired).
   */
  async countOverlapping(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workPostId: string,
    start: Date,
    end: Date,
  ): Promise<number> {
    const result = await tx.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM orders
      WHERE "tenantId" = ${tenantId}
        AND "workPostId" = ${workPostId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        AND "scheduledStart" < ${end}
        AND "scheduledEnd" > ${start}
        AND "deletedAt" IS NULL
    `;
    return Number(result[0].count);
  }

  /**
   * Find existing orders for a work post on a given date range (read-only, no lock).
   */
  async findOrdersInRange(
    tenantId: string,
    workPostId: string,
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    return this.tenantPrisma.forTenant(tenantId).order.findMany({
      where: {
        workPostId,
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
        scheduledStart: { lt: rangeEnd },
        scheduledEnd: { gt: rangeStart },
      },
      select: {
        id: true,
        scheduledStart: true,
        scheduledEnd: true,
        status: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }

  /**
   * Batch-fetch orders for multiple work posts in a given date range (single query).
   */
  async findOrdersForWorkPostsInRange(
    tenantId: string,
    workPostIds: string[],
    rangeStart: Date,
    rangeEnd: Date,
  ) {
    if (workPostIds.length === 0) return [];
    return this.tenantPrisma.forTenant(tenantId).order.findMany({
      where: {
        workPostId: { in: workPostIds },
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
        scheduledStart: { lt: rangeEnd },
        scheduledEnd: { gt: rangeStart },
      },
      select: {
        id: true,
        workPostId: true,
        scheduledStart: true,
        scheduledEnd: true,
        status: true,
      },
      orderBy: { scheduledStart: 'asc' },
    });
  }
}
