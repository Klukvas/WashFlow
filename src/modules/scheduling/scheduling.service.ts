import { Injectable, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { fromZonedTime } from 'date-fns-tz';
import { SchedulingRepository } from './scheduling.repository';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { WorkforceRepository } from '../workforce/workforce.repository';
import { resolveBookingSettings } from '../../common/utils/booking-settings.util';
import {
  TimeSlot,
  CheckAvailabilityParams,
  ReserveSlotParams,
} from './types/scheduling.types';

@Injectable()
export class SchedulingService {
  constructor(
    private readonly schedulingRepo: SchedulingRepository,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly workforceRepo: WorkforceRepository,
  ) {}

  /**
   * Check available time slots for a given branch/workPost/date.
   * Applies EffectiveCapacity = min(freeWorkPosts, availableEmployees).
   * If branch has no employee profiles configured, falls back to work-post count only.
   * Read-only, no locking.
   */
  async checkAvailability(
    params: CheckAvailabilityParams,
  ): Promise<TimeSlot[]> {
    const {
      tenantId,
      branchId,
      workPostId,
      assignedEmployeeId,
      date,
      durationMinutes,
    } = params;

    // Load booking settings and branch timezone in parallel
    const tenantDb = this.tenantPrisma.forTenant(tenantId);
    const [settings, branchRecord] = await Promise.all([
      resolveBookingSettings(this.prisma, tenantId, branchId),
      tenantDb.branch.findUnique({
        where: { id: branchId },
        select: { timezone: true },
      }),
    ]);
    const timezone = branchRecord?.timezone ?? 'UTC';

    // Enforce workingDays: use local timezone day-of-week
    const localDayStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
    }).format(date);
    const dayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dayOfWeek = dayMap[localDayStr] ?? date.getUTCDay();
    if (!settings.workingDays.includes(dayOfWeek)) {
      return [];
    }

    // Enforce maxAdvanceBookingDays
    const now = new Date();
    const maxDate = new Date(
      now.getTime() + settings.maxAdvanceBookingDays * 86_400_000,
    );
    if (date.getTime() > maxDate.getTime()) {
      return [];
    }

    const slotDuration = durationMinutes || settings.slotDurationMinutes;
    if (slotDuration <= 0) {
      return [];
    }
    const bufferTime = settings.bufferTimeMinutes;
    const workStart = settings.workingHoursStart;
    const workEnd = settings.workingHoursEnd;
    const workPosts = await tenantDb.workPost.findMany({
      where: workPostId
        ? { id: workPostId, isActive: true }
        : { branchId, isActive: true },
      select: { id: true, name: true },
    });

    const workPostIds = workPosts.map((p) => p.id);
    const nameMap = new Map(workPosts.map((p) => [p.id, p.name]));

    // Build date range (convert local working hours to UTC)
    const dayStart = this.parseLocalTime(date, workStart, timezone);
    const dayEnd = this.parseLocalTime(date, workEnd, timezone);

    // Zero-profile fallback: if no profiles configured for branch, skip workforce cap
    const totalProfiles = await this.workforceRepo.countProfilesForBranch(
      tenantId,
      branchId,
    );

    // Batch-fetch all orders for all work posts in one query
    const allOrders = await this.schedulingRepo.findOrdersForWorkPostsInRange(
      tenantId,
      workPostIds,
      dayStart,
      dayEnd,
    );

    // Group orders by work post
    const ordersByWorkPost = new Map<string, typeof allOrders>();
    for (const wpId of workPostIds) {
      ordersByWorkPost.set(wpId, []);
    }
    for (const order of allOrders) {
      const list = ordersByWorkPost.get(order.workPostId ?? '');
      if (list) list.push(order);
    }

    // Batch-fetch employee availability (2 queries instead of N per-slot queries)
    let employeeAvailabilityBySlot: Map<number, string[]> | null = null;
    if (totalProfiles > 0) {
      const pad = (n: number) => String(n).padStart(2, '0');

      // 1. Fetch all candidate employees for this branch
      const candidates = await tenantDb.employeeProfile.findMany({
        where: {
          branchId,
          isWorker: true,
          active: true,
          workStartTime: { not: null },
          workEndTime: { not: null },
          user: { deletedAt: null },
          branch: { deletedAt: null },
        },
        select: { id: true, workStartTime: true, workEndTime: true },
      });

      // 2. Fetch all active orders for candidates in the day range (with buffer)
      const candidateIds = candidates.map((c) => c.id);
      const bufferedDayStart = new Date(
        dayStart.getTime() - bufferTime * 60000,
      );
      const bufferedDayEnd = new Date(dayEnd.getTime() + bufferTime * 60000);

      const activeOrders =
        candidateIds.length > 0
          ? await tenantDb.order.findMany({
              where: {
                assignedEmployeeId: { in: candidateIds },
                status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
                scheduledStart: { lt: bufferedDayEnd },
                scheduledEnd: { gt: bufferedDayStart },
                deletedAt: null,
              },
              select: {
                assignedEmployeeId: true,
                scheduledStart: true,
                scheduledEnd: true,
              },
            })
          : [];

      // 3. Compute per-slot availability in memory
      // Helper: format a UTC Date as HH:MM in the branch timezone
      const toLocalHHMM = (d: Date) => {
        const raw = new Intl.DateTimeFormat('en-GB', {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(d);
        // V8 can return "24:00" for midnight — normalise to "00:00"
        return raw === '24:00' ? '00:00' : raw;
      };

      employeeAvailabilityBySlot = new Map();
      let slotIdx = 0;
      let cursor = new Date(dayStart);
      while (cursor.getTime() + slotDuration * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + slotDuration * 60000);
        const slotStartHH = toLocalHHMM(cursor);
        const slotEndHH = toLocalHHMM(slotEnd);
        const bufferedStart = new Date(cursor.getTime() - bufferTime * 60000);
        const bufferedEnd = new Date(slotEnd.getTime() + bufferTime * 60000);

        const available = candidates
          .filter((c) => {
            if (!c.workStartTime || c.workStartTime > slotStartHH) return false;
            if (!c.workEndTime || c.workEndTime < slotEndHH) return false;
            const hasConflict = activeOrders.some(
              (o) =>
                o.assignedEmployeeId === c.id &&
                o.scheduledStart < bufferedEnd &&
                o.scheduledEnd > bufferedStart,
            );
            return !hasConflict;
          })
          .map((c) => c.id);

        employeeAvailabilityBySlot.set(slotIdx, available);
        cursor = new Date(cursor.getTime() + slotDuration * 60000);
        slotIdx++;
      }
    }

    // Pass 1: compute per-post slot availability
    const perPostSlots = new Map<
      string,
      { workPostId: string; workPostName: string; available: boolean }[]
    >();

    for (const wpId of workPostIds) {
      const existingOrders = ordersByWorkPost.get(wpId) ?? [];

      const wpSlots: {
        workPostId: string;
        workPostName: string;
        available: boolean;
      }[] = [];
      let cursor = new Date(dayStart);
      while (cursor.getTime() + slotDuration * 60000 <= dayEnd.getTime()) {
        const slotEnd = new Date(cursor.getTime() + slotDuration * 60000);

        const bufferedStart = new Date(cursor.getTime() - bufferTime * 60000);
        const bufferedEnd = new Date(slotEnd.getTime() + bufferTime * 60000);

        const hasConflict = existingOrders.some(
          (order) =>
            order.scheduledStart < bufferedEnd &&
            order.scheduledEnd > bufferedStart,
        );

        wpSlots.push({
          workPostId: wpId,
          workPostName: nameMap.get(wpId) || wpId,
          available: !hasConflict,
        });

        cursor = new Date(cursor.getTime() + slotDuration * 60000);
      }

      perPostSlots.set(wpId, wpSlots);
    }

    // Pass 2: build output applying workforce capacity cap per time slot
    const slots: TimeSlot[] = [];
    let cursor = new Date(dayStart);
    let slotIdx = 0;
    while (cursor.getTime() + slotDuration * 60000 <= dayEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + slotDuration * 60000);
      const slotStart = new Date(cursor);

      // Collect indices of work posts available at this time point
      const availablePostIndices: number[] = [];
      for (let i = 0; i < workPostIds.length; i++) {
        const wpId = workPostIds[i];
        const wpSlots = perPostSlots.get(wpId);
        if (wpSlots?.[slotIdx]?.available) {
          availablePostIndices.push(i);
        }
      }

      // Apply workforce cap when profiles are configured
      let effectiveCapacity = availablePostIndices.length;
      if (
        totalProfiles > 0 &&
        availablePostIndices.length > 0 &&
        employeeAvailabilityBySlot
      ) {
        const availableEmployeeIds =
          employeeAvailabilityBySlot.get(slotIdx) ?? [];

        if (assignedEmployeeId) {
          const isEmployeeFree =
            availableEmployeeIds.includes(assignedEmployeeId);
          effectiveCapacity = isEmployeeFree ? availablePostIndices.length : 0;
        } else {
          effectiveCapacity = Math.min(
            availablePostIndices.length,
            availableEmployeeIds.length,
          );
        }
      }

      // Only the first `effectiveCapacity` available posts remain available
      const cappedAvailable = new Set(
        availablePostIndices.slice(0, effectiveCapacity),
      );

      for (let i = 0; i < workPostIds.length; i++) {
        const wpId = workPostIds[i];
        const wpSlots = perPostSlots.get(wpId);
        const rawAvailable = wpSlots?.[slotIdx]?.available ?? false;
        const available = rawAvailable && cappedAvailable.has(i);

        slots.push({
          start: new Date(slotStart),
          end: slotEnd,
          workPostId: wpId,
          workPostName: nameMap.get(wpId) || wpId,
          available,
        });
      }

      cursor = new Date(cursor.getTime() + slotDuration * 60000);
      slotIdx++;
    }

    return slots;
  }

  /**
   * Reserve a slot with row-level locking to prevent double-booking.
   * MUST be called within a Prisma interactive transaction.
   */
  async reserveSlot(
    tx: Prisma.TransactionClient,
    params: ReserveSlotParams,
  ): Promise<void> {
    const {
      tenantId,
      workPostId,
      scheduledStart,
      scheduledEnd,
      bufferMinutes,
    } = params;

    const bufferedStart = new Date(
      scheduledStart.getTime() - bufferMinutes * 60000,
    );
    const bufferedEnd = new Date(
      scheduledEnd.getTime() + bufferMinutes * 60000,
    );

    await this.schedulingRepo.lockOverlappingSlots(
      tx,
      tenantId,
      workPostId,
      bufferedStart,
      bufferedEnd,
    );

    const conflicts = await this.schedulingRepo.countOverlapping(
      tx,
      tenantId,
      workPostId,
      bufferedStart,
      bufferedEnd,
    );

    if (conflicts > 0) {
      throw new ConflictException(
        'The requested time slot overlaps with an existing booking',
      );
    }
  }

  /**
   * Validate no overlap without locking (for UI checks).
   */
  async validateNoOverlap(
    tenantId: string,
    workPostId: string,
    start: Date,
    end: Date,
    bufferMinutes: number,
  ): Promise<boolean> {
    const bufferedStart = new Date(start.getTime() - bufferMinutes * 60000);
    const bufferedEnd = new Date(end.getTime() + bufferMinutes * 60000);

    const existing = await this.schedulingRepo.findOrdersInRange(
      tenantId,
      workPostId,
      bufferedStart,
      bufferedEnd,
    );

    return existing.length === 0;
  }

  applyBufferTime(
    start: Date,
    end: Date,
    bufferMinutes: number,
  ): { bufferedStart: Date; bufferedEnd: Date } {
    return {
      bufferedStart: new Date(start.getTime() - bufferMinutes * 60000),
      bufferedEnd: new Date(end.getTime() + bufferMinutes * 60000),
    };
  }

  /**
   * Convert a local time string (e.g. "20:00") on a given date
   * into a UTC Date, accounting for the branch timezone and DST.
   * Uses date-fns-tz for correct DST transition handling.
   */
  private parseLocalTime(date: Date, timeStr: string, timezone: string): Date {
    const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr);
    if (!match) {
      throw new Error(`Invalid time format: "${timeStr}" (expected HH:MM)`);
    }
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
      throw new Error(`Invalid time value: "${timeStr}"`);
    }

    const dateStr = date.toISOString().split('T')[0];
    const pad = (n: number) => String(n).padStart(2, '0');

    // fromZonedTime interprets the date+time as wall-clock in the given timezone
    // and returns the correct UTC instant, handling DST transitions properly.
    return fromZonedTime(
      `${dateStr}T${pad(hours)}:${pad(minutes)}:00`,
      timezone,
    );
  }
}
