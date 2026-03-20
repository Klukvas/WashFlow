import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { applyBranchScope } from '../../common/utils/branch-scope.util';

export interface KpiData {
  revenueToday: number;
  ordersToday: number;
  avgOrderDuration: number;
  cancelRateToday: number;
  activeClientsToday: number;
  occupancyRate: number;
}

export interface LiveOperations {
  inProgressCount: number;
  waitingCount: number;
  freeWorkPosts: number;
  overdueOrders: number;
}

export interface BranchPerformanceRow {
  branchId: string;
  name: string;
  revenue: number;
  orders: number;
  avgCheck: number;
  loadRate: number;
}

export interface EmployeePerformanceRow {
  employeeId: string;
  name: string;
  branch: string;
  orders: number;
  revenue: number;
  cancelRate: number;
}

export interface DashboardAlert {
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  messageKey: string;
  payload: Record<string, unknown>;
}

export interface OnlineBookingStats {
  bySource: Array<{ source: string; count: number; revenue: number }>;
  total: number;
  onlineCount: number;
  onlineRate: number;
}

const ALERT_THRESHOLDS = {
  LOW_BOOKINGS_WEEKLY: 20,
  HIGH_CANCELLATION_RATE: 40,
  LOW_UTILIZATION: 50,
  HIGH_NO_SHOW_RATE: 30,
  SLOW_AVG_COMPLETION_MINUTES: 60,
} as const;

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  private buildDateFilter(
    query: AnalyticsQueryDto,
    userBranchId: string | null = null,
  ): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { deletedAt: null };
    // JWT branchId takes precedence over query param
    if (userBranchId !== null) {
      where.branchId = userBranchId;
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }
    if (query.dateFrom || query.dateTo) {
      where.scheduledStart = {};
      if (query.dateFrom) where.scheduledStart.gte = new Date(query.dateFrom);
      if (query.dateTo) where.scheduledStart.lte = new Date(query.dateTo);
    }
    return where;
  }

  private getTodayRange(): { todayStart: Date; todayEnd: Date } {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const todayEnd = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
    return { todayStart, todayEnd };
  }

  private effectiveBranchId(
    userBranchId: string | null,
    queryBranchId?: string,
  ): string | null {
    if (userBranchId !== null) return userBranchId;
    return queryBranchId ?? null;
  }

  async getDashboardStats(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    const where = this.buildDateFilter(query, branchId);
    const db = this.db(tenantId);

    const [totalOrders, completedOrders, cancelledOrders, revenue] =
      await Promise.all([
        db.order.count({ where }),
        db.order.count({ where: { ...where, status: 'COMPLETED' } }),
        db.order.count({ where: { ...where, status: 'CANCELLED' } }),
        db.order.aggregate({
          where: { ...where, status: { in: ['COMPLETED', 'IN_PROGRESS'] } },
          _sum: { totalPrice: true },
        }),
      ]);

    return {
      totalOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue: revenue._sum.totalPrice || 0,
      completionRate:
        totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
    };
  }

  async getRevenueByStatus(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    const where = this.buildDateFilter(query, branchId);
    return this.db(tenantId).order.groupBy({
      by: ['status'],
      where,
      _sum: { totalPrice: true },
      _count: { id: true },
    });
  }

  async getPopularServices(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ) {
    const db = this.db(tenantId);

    // Build where conditions for aggregation
    const where = this.buildDateFilter(query, branchId);
    const orderWhere = {
      ...where,
      status: {
        in: ['COMPLETED' as const, 'IN_PROGRESS' as const, 'BOOKED' as const],
      },
    };

    // Use groupBy on OrderService joined through orders
    const orderIds = await db.order.findMany({
      where: orderWhere,
      select: { id: true },
      take: 10000,
    });

    if (orderIds.length === 0) return [];

    const grouped = await db.orderService.groupBy({
      by: ['serviceId'],
      where: { orderId: { in: orderIds.map((o) => o.id) } },
      _sum: { quantity: true, price: true },
    });

    const serviceIds = grouped.map((g) => g.serviceId);
    const services = await db.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(services.map((s) => [s.id, s.name]));

    return grouped
      .map((g) => ({
        serviceId: g.serviceId,
        name: nameMap.get(g.serviceId) ?? g.serviceId,
        count: g._sum.quantity ?? 0,
        revenue: Math.round(Number(g._sum.price ?? 0) * 100) / 100,
      }))
      .sort((a, b) => b.count - a.count);
  }

  // ─── KPI ────────────────────────────────────────────────────────────────────

  async getKpi(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ): Promise<KpiData> {
    const db = this.db(tenantId);
    const { todayStart, todayEnd } = this.getTodayRange();
    const eBranchId = this.effectiveBranchId(branchId, query.branchId);

    const todayBase: Prisma.OrderWhereInput = applyBranchScope(
      { deletedAt: null, scheduledStart: { gte: todayStart, lte: todayEnd } },
      eBranchId,
    );
    const workPostBase = applyBranchScope({ isActive: true }, eBranchId);

    const prisma = this.tenantPrisma.forTenant(tenantId);

    const [
      ordersToday,
      cancelledToday,
      revenueAgg,
      distinctClients,
      completedWithTimes,
      workPostCount,
      avgDurationResult,
    ] = await Promise.all([
      db.order.count({ where: todayBase }),
      db.order.count({ where: { ...todayBase, status: 'CANCELLED' } }),
      db.order.aggregate({
        where: { ...todayBase, status: 'COMPLETED' },
        _sum: { totalPrice: true },
      }),
      db.order.findMany({
        where: todayBase,
        select: { clientId: true },
        distinct: ['clientId'],
      }),
      db.order.findMany({
        where: {
          ...todayBase,
          status: 'COMPLETED',
        },
        select: { scheduledStart: true, scheduledEnd: true },
      }),
      db.workPost.count({ where: workPostBase }),
      prisma.$queryRaw<[{ avg: number | null }]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("scheduledEnd" - "scheduledStart")) / 60) as avg
        FROM orders
        WHERE "tenantId" = ${tenantId}
          AND status = 'COMPLETED'
          AND "scheduledStart" >= ${todayStart}
          AND "scheduledStart" <= ${todayEnd}
          AND "deletedAt" IS NULL
          ${eBranchId ? Prisma.sql`AND "branchId" = ${eBranchId}` : Prisma.empty}
      `,
    ]);

    const revenueToday = Number(revenueAgg._sum.totalPrice ?? 0);
    const activeClientsToday = distinctClients.length;
    const cancelRateToday =
      ordersToday > 0
        ? Math.round((cancelledToday / ordersToday) * 100 * 10) / 10
        : 0;

    // avg duration in minutes via SQL aggregation
    const rawAvg = avgDurationResult[0]?.avg;
    const avgOrderDuration =
      rawAvg != null ? Math.round(Number(rawAvg) * 10) / 10 : 0;

    // occupancy = scheduled minutes / (work posts × elapsed minutes today)
    const utcNow = new Date();
    const minutesElapsedToday = Math.max(
      1,
      utcNow.getUTCHours() * 60 + utcNow.getUTCMinutes(),
    );
    const scheduledMinutes = completedWithTimes.reduce(
      (sum, o) =>
        sum +
        (o.scheduledEnd
          ? (o.scheduledEnd.getTime() - o.scheduledStart.getTime()) / 60_000
          : 0),
      0,
    );
    const occupancyRate =
      workPostCount > 0
        ? Math.min(
            100,
            Math.round(
              (scheduledMinutes / (workPostCount * minutesElapsedToday)) *
                100 *
                10,
            ) / 10,
          )
        : 0;

    return {
      revenueToday,
      ordersToday,
      avgOrderDuration,
      cancelRateToday,
      activeClientsToday,
      occupancyRate,
    };
  }

  // ─── Live Operations ─────────────────────────────────────────────────────────

  async getLiveOperations(
    tenantId: string,
    branchId: string | null = null,
  ): Promise<LiveOperations> {
    const db = this.db(tenantId);
    const now = new Date();

    const baseWhere = applyBranchScope(
      { deletedAt: null } as Prisma.OrderWhereInput,
      branchId,
    );
    const workPostWhere = applyBranchScope({ isActive: true }, branchId);

    const [
      inProgressCount,
      waitingCount,
      overdueOrders,
      activeWorkPosts,
      busyWorkPostIds,
    ] = await Promise.all([
      db.order.count({ where: { ...baseWhere, status: 'IN_PROGRESS' } }),
      db.order.count({
        where: {
          ...baseWhere,
          status: { in: ['BOOKED', 'BOOKED_PENDING_CONFIRMATION'] },
          scheduledStart: { lte: now },
        },
      }),
      db.order.count({
        where: {
          ...baseWhere,
          status: 'IN_PROGRESS',
          scheduledEnd: { lt: now },
        },
      }),
      db.workPost.count({ where: workPostWhere }),
      db.order.findMany({
        where: {
          ...baseWhere,
          status: 'IN_PROGRESS',
          workPostId: { not: null },
        },
        select: { workPostId: true },
        distinct: ['workPostId'],
      }),
    ]);

    const busyCount = busyWorkPostIds.filter(
      (o) => o.workPostId !== null,
    ).length;
    const freeWorkPosts = Math.max(0, activeWorkPosts - busyCount);

    return {
      inProgressCount,
      waitingCount,
      freeWorkPosts,
      overdueOrders: Number(overdueOrders),
    };
  }

  // ─── Branch Performance ──────────────────────────────────────────────────────

  async getBranchPerformance(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ): Promise<BranchPerformanceRow[]> {
    const db = this.db(tenantId);
    const eBranchId = this.effectiveBranchId(branchId, query.branchId);

    const scheduledStartFilter: Prisma.DateTimeFilter | undefined =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;
    const dateWhere: Prisma.OrderWhereInput = applyBranchScope(
      {
        deletedAt: null,
        ...(scheduledStartFilter
          ? { scheduledStart: scheduledStartFilter }
          : {}),
      },
      eBranchId,
    );

    const [branches, grouped] = await Promise.all([
      db.branch.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      }),
      db.order.groupBy({
        by: ['branchId'],
        where: dateWhere,
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
    ]);

    const branchMap = new Map(branches.map((b) => [b.id, b.name]));
    const revenueMap = new Map(
      grouped.map((g) => [
        g.branchId,
        { revenue: Number(g._sum.totalPrice ?? 0), orders: g._count.id },
      ]),
    );

    const maxOrders = Math.max(
      ...Array.from(revenueMap.values()).map((v) => v.orders),
      1,
    );

    return branches.map((branch) => {
      const stats = revenueMap.get(branch.id) ?? { revenue: 0, orders: 0 };
      return {
        branchId: branch.id,
        name: branchMap.get(branch.id) ?? branch.id,
        revenue: stats.revenue,
        orders: stats.orders,
        avgCheck:
          stats.orders > 0
            ? Math.round((stats.revenue / stats.orders) * 100) / 100
            : 0,
        loadRate: Math.round((stats.orders / maxOrders) * 100),
      };
    });
  }

  // ─── Employee Performance ────────────────────────────────────────────────────

  async getEmployeePerformance(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ): Promise<EmployeePerformanceRow[]> {
    const db = this.db(tenantId);
    const eBranchId = this.effectiveBranchId(branchId, query.branchId);

    const scheduledStartFilter: Prisma.DateTimeFilter | undefined =
      query.dateFrom || query.dateTo
        ? {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}),
          }
        : undefined;
    const baseWhere = applyBranchScope(
      {
        deletedAt: null,
        createdById: { not: null },
        ...(scheduledStartFilter
          ? { scheduledStart: scheduledStartFilter }
          : {}),
      } as Prisma.OrderWhereInput,
      eBranchId,
    );

    const [completedGrouped, cancelledGrouped] = await Promise.all([
      db.order.groupBy({
        by: ['createdById'],
        where: { ...baseWhere, status: { in: ['COMPLETED', 'IN_PROGRESS'] } },
        _sum: { totalPrice: true },
        _count: { id: true },
      }),
      db.order.groupBy({
        by: ['createdById'],
        where: { ...baseWhere, status: 'CANCELLED' },
        _count: { id: true },
      }),
    ]);

    const employeeIds = completedGrouped
      .map((g) => g.createdById)
      .filter((id): id is string => id !== null);

    if (employeeIds.length === 0) return [];

    const users = await db.user.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        branch: { select: { name: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));
    const cancelMap = new Map(
      cancelledGrouped.map((g) => [g.createdById, g._count.id]),
    );

    return completedGrouped
      .filter((g) => g.createdById !== null && userMap.has(g.createdById))
      .map((g) => {
        const user = userMap.get(g.createdById!)!;
        const completedCount = g._count.id;
        const cancelledCount = cancelMap.get(g.createdById) ?? 0;
        const totalCount = completedCount + cancelledCount;
        return {
          employeeId: user.id,
          name: `${user.firstName} ${user.lastName}`,
          branch: user.branch?.name ?? '—',
          orders: completedCount,
          revenue: Math.round(Number(g._sum.totalPrice ?? 0) * 100) / 100,
          cancelRate:
            totalCount > 0
              ? Math.round((cancelledCount / totalCount) * 100 * 10) / 10
              : 0,
        };
      })
      .sort((a, b) => b.orders - a.orders);
  }

  // ─── Alerts ──────────────────────────────────────────────────────────────────

  async getAlerts(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ): Promise<DashboardAlert[]> {
    const db = this.db(tenantId);
    const eBranchId = this.effectiveBranchId(branchId, query.branchId);
    const { todayStart, todayEnd } = this.getTodayRange();

    // Build date ranges for revenue-drop comparison
    const now = new Date();
    const periodEnd = query.dateTo ? new Date(query.dateTo) : now;
    const periodStart = query.dateFrom ? new Date(query.dateFrom) : todayStart;
    const periodLengthMs = periodEnd.getTime() - periodStart.getTime();
    const prevPeriodStart = new Date(periodStart.getTime() - periodLengthMs);
    const prevPeriodEnd = new Date(periodEnd.getTime() - periodLengthMs);

    // This week / last week
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const baseToday = applyBranchScope(
      {
        deletedAt: null,
        scheduledStart: { gte: todayStart, lte: todayEnd },
      } as Prisma.OrderWhereInput,
      eBranchId,
    );
    const basePeriod = applyBranchScope(
      {
        deletedAt: null,
        scheduledStart: { gte: periodStart, lte: periodEnd },
      } as Prisma.OrderWhereInput,
      eBranchId,
    );
    const basePrevPeriod = applyBranchScope(
      {
        deletedAt: null,
        scheduledStart: { gte: prevPeriodStart, lte: prevPeriodEnd },
      } as Prisma.OrderWhereInput,
      eBranchId,
    );
    const baseThisWeek = applyBranchScope(
      {
        deletedAt: null,
        scheduledStart: { gte: weekAgo, lte: now },
      } as Prisma.OrderWhereInput,
      eBranchId,
    );
    const baseLastWeek = applyBranchScope(
      {
        deletedAt: null,
        scheduledStart: { gte: twoWeeksAgo, lte: weekAgo },
      } as Prisma.OrderWhereInput,
      eBranchId,
    );

    const [
      ordersToday,
      cancelledToday,
      currentRevenue,
      prevRevenue,
      thisWeekOrders,
      lastWeekOrders,
    ] = await Promise.all([
      db.order.count({ where: baseToday }),
      db.order.count({ where: { ...baseToday, status: 'CANCELLED' } }),
      db.order.aggregate({ where: basePeriod, _sum: { totalPrice: true } }),
      db.order.aggregate({ where: basePrevPeriod, _sum: { totalPrice: true } }),
      db.order.count({ where: baseThisWeek }),
      db.order.count({ where: baseLastWeek }),
    ]);

    const alerts: DashboardAlert[] = [];

    // 1. High cancel rate today
    if (ordersToday > 0) {
      const cancelRate = (cancelledToday / ordersToday) * 100;
      if (cancelRate > ALERT_THRESHOLDS.LOW_BOOKINGS_WEEKLY) {
        alerts.push({
          type: 'HIGH_CANCEL_RATE',
          severity:
            cancelRate > ALERT_THRESHOLDS.HIGH_CANCELLATION_RATE
              ? 'CRITICAL'
              : 'HIGH',
          messageKey: 'alerts.highCancelRate',
          payload: { rate: Math.round(cancelRate * 10) / 10 },
        });
      }
    }

    // 2. Revenue drop vs previous period
    const currRev = Number(currentRevenue._sum.totalPrice ?? 0);
    const prevRev = Number(prevRevenue._sum.totalPrice ?? 0);
    if (prevRev > 0) {
      const dropPct = ((prevRev - currRev) / prevRev) * 100;
      if (dropPct > ALERT_THRESHOLDS.LOW_BOOKINGS_WEEKLY) {
        alerts.push({
          type: 'REVENUE_DROP',
          severity:
            dropPct > ALERT_THRESHOLDS.LOW_UTILIZATION ? 'HIGH' : 'MEDIUM',
          messageKey: 'alerts.revenueDrop',
          payload: { pct: Math.round(dropPct * 10) / 10 },
        });
      }
    }

    // 3. Booking decline this week vs last week
    if (lastWeekOrders > 0) {
      const declinePct =
        ((lastWeekOrders - thisWeekOrders) / lastWeekOrders) * 100;
      if (declinePct > ALERT_THRESHOLDS.HIGH_NO_SHOW_RATE) {
        alerts.push({
          type: 'BOOKING_DECLINE',
          severity:
            declinePct > ALERT_THRESHOLDS.SLOW_AVG_COMPLETION_MINUTES
              ? 'HIGH'
              : 'MEDIUM',
          messageKey: 'alerts.bookingDecline',
          payload: { pct: Math.round(declinePct * 10) / 10 },
        });
      }
    }

    return alerts;
  }

  // ─── Online Booking Stats ────────────────────────────────────────────────────

  async getOnlineBookingStats(
    tenantId: string,
    query: AnalyticsQueryDto,
    branchId: string | null = null,
  ): Promise<OnlineBookingStats> {
    const where = this.buildDateFilter(query, branchId);
    const grouped = await this.db(tenantId).order.groupBy({
      by: ['source'],
      where,
      _count: { id: true },
      _sum: { totalPrice: true },
    });

    const bySource = grouped.map((g) => ({
      source: g.source,
      count: g._count.id,
      revenue: Math.round(Number(g._sum.totalPrice ?? 0) * 100) / 100,
    }));

    const total = bySource.reduce((sum, s) => sum + s.count, 0);
    const onlineCount = bySource
      .filter((s) => s.source !== 'INTERNAL')
      .reduce((sum, s) => sum + s.count, 0);
    const onlineRate =
      total > 0 ? Math.round((onlineCount / total) * 100 * 10) / 10 : 0;

    return { bySource, total, onlineCount, onlineRate };
  }
}
