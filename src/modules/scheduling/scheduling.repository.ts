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

  /** Lock the stable resource even when no overlapping orders exist yet. */
  async lockWorkPost(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workPostId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT id FROM work_posts
      WHERE id = ${workPostId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
  }

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
    excludeOrderId?: string,
  ) {
    return tx.$queryRaw`
      SELECT id FROM orders
      WHERE "tenantId" = ${tenantId}
        AND "workPostId" = ${workPostId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        AND "scheduledStart" < ${end}
        AND "scheduledEnd" > ${start}
        AND "deletedAt" IS NULL
        ${excludeOrderId ? Prisma.sql`AND id <> ${excludeOrderId}` : Prisma.empty}
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
    excludeOrderId?: string,
  ): Promise<number> {
    const result = await tx.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM orders
      WHERE "tenantId" = ${tenantId}
        AND "workPostId" = ${workPostId}
        AND status NOT IN ('CANCELLED', 'NO_SHOW', 'COMPLETED')
        AND "scheduledStart" < ${end}
        AND "scheduledEnd" > ${start}
        AND "deletedAt" IS NULL
        ${excludeOrderId ? Prisma.sql`AND id <> ${excludeOrderId}` : Prisma.empty}
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
    excludeOrderId?: string,
  ) {
    if (workPostIds.length === 0) return [];
    return this.tenantPrisma.forTenant(tenantId).order.findMany({
      where: {
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
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
