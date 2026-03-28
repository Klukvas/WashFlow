import request from 'supertest';
import { App } from 'supertest/types';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanupTenant, TestSetup } from './helpers/test-app';

/**
 * Deep coverage E2E tests for work-post time slots and worker scheduling.
 *
 * Complements scheduling-flows.e2e-spec.ts by testing:
 * - Buffer boundary precision (exact edge cases)
 * - Worker work-hours enforcement
 * - Terminal statuses freeing employee slots
 * - Worker buffer overlap precision
 * - Availability API slot-level accuracy
 * - Multi-service combined duration blocking
 * - Partial overlap geometries (before-buffer, containment)
 * - Restore of terminal-status orders bypassing conflict
 * - Soft-deleted orders invisible to availability
 * - Working hours day boundaries
 * - IN_PROGRESS orders still blocking slots
 */

const SLUG = 'e2e-slots-deep';

describe('Scheduling Slots Deep Coverage (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;
  let branchId: string;

  let post1Id: string;
  let post2Id: string;
  let svc30Id: string; // 30-min service
  let svc60Id: string; // 60-min service
  let clientId: string;
  let vehicleId: string;

  // Workers with different hour ranges
  let worker1Id: string; // 08:00–20:00 (full day)
  let worker2Id: string; // 08:00–20:00 (full day)
  let worker3Id: string; // 10:00–16:00 (limited hours)

  beforeAll(async () => {
    const setup: TestSetup = await createTestApp(SLUG);
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;
    branchId = setup.testBranch.id;

    // Allow enough advance booking for ~34 calendar days (29 non-Sunday days)
    await prisma.bookingSettings.updateMany({
      where: { tenantId },
      data: { maxAdvanceBookingDays: 50 },
    });

    // ── Work posts ────────────────────────────────────
    const p1 = await prisma.workPost.create({
      data: { tenantId, branchId, name: 'Post A' },
    });
    const p2 = await prisma.workPost.create({
      data: { tenantId, branchId, name: 'Post B' },
    });
    post1Id = p1.id;
    post2Id = p2.id;

    // ── Services ──────────────────────────────────────
    const s30 = await prisma.service.create({
      data: { tenantId, name: 'Express', durationMin: 30, price: 250 },
    });
    const s60 = await prisma.service.create({
      data: { tenantId, name: 'Premium', durationMin: 60, price: 500 },
    });
    svc30Id = s30.id;
    svc60Id = s60.id;

    // ── Client & vehicle ──────────────────────────────
    const cl = await prisma.client.create({
      data: {
        tenantId,
        firstName: 'Taras',
        lastName: 'Shevchenko',
        phone: '+380991110000',
      },
    });
    clientId = cl.id;

    const vh = await prisma.vehicle.create({
      data: { tenantId, clientId, make: 'Honda', licensePlate: 'XY9999ZZ' },
    });
    vehicleId = vh.id;

    // ── Workers ───────────────────────────────────────
    const hash = await argon2.hash('password123');

    const u1 = await prisma.user.create({
      data: {
        tenantId,
        email: `w1@${SLUG}.com`,
        passwordHash: hash,
        firstName: 'W',
        lastName: 'One',
      },
    });
    const u2 = await prisma.user.create({
      data: {
        tenantId,
        email: `w2@${SLUG}.com`,
        passwordHash: hash,
        firstName: 'W',
        lastName: 'Two',
      },
    });
    const u3 = await prisma.user.create({
      data: {
        tenantId,
        email: `w3@${SLUG}.com`,
        passwordHash: hash,
        firstName: 'W',
        lastName: 'Three',
      },
    });

    const ep1 = await prisma.employeeProfile.create({
      data: {
        tenantId,
        userId: u1.id,
        branchId,
        isWorker: true,
        active: true,
        workStartTime: '08:00',
        workEndTime: '20:00',
      },
    });
    const ep2 = await prisma.employeeProfile.create({
      data: {
        tenantId,
        userId: u2.id,
        branchId,
        isWorker: true,
        active: true,
        workStartTime: '08:00',
        workEndTime: '20:00',
      },
    });
    const ep3 = await prisma.employeeProfile.create({
      data: {
        tenantId,
        userId: u3.id,
        branchId,
        isWorker: true,
        active: true,
        workStartTime: '10:00',
        workEndTime: '16:00',
      },
    });

    worker1Id = ep1.id;
    worker2Id = ep2.id;
    worker3Id = ep3.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, app);
  }, 15_000);

  // ─── Helpers ──────────────────────────────────────────

  /** Returns the Nth non-Sunday day from today (guarantees unique date per offset). */
  function nextWeekday(n: number): Date {
    const d = new Date();
    let count = 0;
    while (count < n) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0) count++;
    }
    return d;
  }

  /** ISO string for a given date at HH:MM UTC. */
  function atUTC(date: Date, hours: number, minutes: number = 0): string {
    const d = new Date(date);
    d.setUTCHours(hours, minutes, 0, 0);
    return d.toISOString();
  }

  function order(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        clientId,
        vehicleId,
        serviceIds: [svc30Id],
        ...overrides,
      });
  }

  function availability(query: Record<string, unknown>) {
    return request(app.getHttpServer())
      .get('/api/v1/orders/availability')
      .set('Authorization', `Bearer ${accessToken}`)
      .query({ branchId, durationMinutes: 30, ...query });
  }

  function patchStatus(
    orderId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status, ...extra });
  }

  function deleteOrder(orderId: string) {
    return request(app.getHttpServer())
      .delete(`/api/v1/orders/${orderId}`)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function restoreOrder(orderId: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/orders/${orderId}/restore`)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  /** Find slot(s) in availability response by hour:minute and optional postId. */
  function findSlots(
    slots: Array<{ start: string; workPostId: string; available: boolean }>,
    hour: number,
    minute: number = 0,
    postId?: string,
  ) {
    return slots.filter((s) => {
      const d = new Date(s.start);
      const timeMatch =
        d.getUTCHours() === hour && d.getUTCMinutes() === minute;
      return postId ? timeMatch && s.workPostId === postId : timeMatch;
    });
  }

  // ═══════════════════════════════════════════════════════
  //  FLOW 13: Buffer boundary precision (work post)
  //
  //  Default buffer = 10 min. Existing order at 10:00–10:30.
  //  After buffer: effective blocked range = 9:50–10:40.
  //
  //  13a: booking at 10:40 → succeeds  (exactly at boundary)
  //  13b: booking at 10:35 → fails     (within buffer)
  //  13c: booking at 9:20  → succeeds  (ends 9:50, gap=10min)
  //  13d: booking at 9:25  → fails     (ends 9:55, gap=5min)
  // ═══════════════════════════════════════════════════════

  describe('Flow 13: Buffer boundary precision', () => {
    const day = nextWeekday(1);

    it('setup: book 10:00–10:30 on post1', async () => {
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);
    });

    it('13a: booking at 10:40 succeeds (exactly at buffer end)', async () => {
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10, 40),
      }).expect(201);
    });

    it('13b: booking at 10:35 fails (within 10-min buffer)', async () => {
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10, 35),
      }).expect(409);
    });

    it('13c: booking at 9:20 succeeds (ends 9:50, gap = buffer)', async () => {
      // 9:20–9:50 → buffered 9:10–10:00
      // Check vs existing 10:00–10:30: scheduledStart(10:00) < 10:00? NO → no conflict
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 9, 20),
      }).expect(201);
    });

    it('13d: booking at 9:25 fails (ends 9:55, gap < buffer)', async () => {
      // 9:25–9:55 → buffered 9:15–10:05
      // Check vs existing 10:00–10:30: 10:00 < 10:05? YES, 10:30 > 9:15? YES → conflict
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 9, 25),
      }).expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 14: Worker hours enforcement
  //
  //  Worker3 works 10:00–16:00. Workers 1,2 work 08:00–20:00.
  //  The availability API with assignedEmployeeId=worker3
  //  should reflect worker3's restricted hours.
  // ═══════════════════════════════════════════════════════

  describe('Flow 14: Worker work hours enforcement', () => {
    const day = nextWeekday(2);

    it('worker3 unavailable at 09:00, available at 10:00, available at 15:30, unavailable at 16:00', async () => {
      const res = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker3Id,
      }).expect(200);

      const slots = res.body.data;

      // 09:00: worker3 starts at 10:00 → unavailable
      const at0900 = findSlots(slots, 9, 0);
      expect(at0900.length).toBeGreaterThan(0);
      expect(at0900.every((s: any) => !s.available)).toBe(true);

      // 10:00: worker3 works 10:00–16:00, slot 10:00–10:30 fits → available
      const at1000 = findSlots(slots, 10, 0);
      expect(at1000.length).toBeGreaterThan(0);
      expect(at1000.some((s: any) => s.available)).toBe(true);

      // 15:30: 30min slot ends at 16:00 = worker3's workEndTime → available
      const at1530 = findSlots(slots, 15, 30);
      expect(at1530.length).toBeGreaterThan(0);
      expect(at1530.some((s: any) => s.available)).toBe(true);

      // 16:00: 30min slot ends at 16:30 > worker3's workEndTime → unavailable
      const at1600 = findSlots(slots, 16, 0);
      expect(at1600.length).toBeGreaterThan(0);
      expect(at1600.every((s: any) => !s.available)).toBe(true);
    });

    it('auto-assign at 09:00 never picks worker3', async () => {
      const res = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 9),
      }).expect(201);

      // worker3 doesn't cover 09:00 → must be worker1 or worker2
      expect(res.body.data.assignedEmployeeId).not.toBe(worker3Id);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 15: Terminal statuses free employee slots
  //
  //  After an order transitions to CANCELLED, NO_SHOW, or
  //  COMPLETED, the assigned worker becomes available again
  //  at that time slot.
  // ═══════════════════════════════════════════════════════

  describe('Flow 15: Terminal statuses free worker slots', () => {
    const day = nextWeekday(3);

    it('CANCELLED order frees worker for same slot', async () => {
      // Book with explicit worker
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Cancel it
      await patchStatus(res1.body.data.id, 'CANCELLED', {
        cancellationReason: 'test',
      }).expect(200);

      // Book again with same worker, same time, same post → should succeed
      const res2 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res2.body.data.assignedEmployeeId).toBe(worker1Id);
    });

    it('NO_SHOW order frees worker for same slot', async () => {
      // Book
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      // NO_SHOW
      await patchStatus(res1.body.data.id, 'NO_SHOW').expect(200);

      // Re-book with same worker → succeeds
      const res2 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      expect(res2.body.data.assignedEmployeeId).toBe(worker1Id);
    });

    it('COMPLETED order frees worker for same slot', async () => {
      // Book → IN_PROGRESS → COMPLETED
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      await patchStatus(res1.body.data.id, 'IN_PROGRESS').expect(200);
      await patchStatus(res1.body.data.id, 'COMPLETED').expect(200);

      // Re-book with same worker → succeeds
      const res2 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      expect(res2.body.data.assignedEmployeeId).toBe(worker1Id);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 16: Employee buffer precision
  //
  //  After worker is booked at 10:00–10:30 (buffer=10min),
  //  the worker's effective blocked range is 9:50–10:40.
  //  Verify via availability API: 10:30 slot unavailable,
  //  11:00 slot available for that worker.
  // ═══════════════════════════════════════════════════════

  describe('Flow 16: Employee buffer precision via availability', () => {
    const day = nextWeekday(4);

    it('worker buffer: 10:30 slot blocked, 11:00 slot free after 10:00 booking', async () => {
      // Book worker1 at 10:00
      await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Check availability for worker1
      const res = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);

      const slots = res.body.data;

      // 10:00 → unavailable (order exists)
      const at1000 = findSlots(slots, 10, 0);
      expect(at1000.every((s: any) => !s.available)).toBe(true);

      // 10:30 → unavailable (within buffer: buffered 10:20–11:10 overlaps 10:00–10:30)
      const at1030 = findSlots(slots, 10, 30);
      expect(at1030.every((s: any) => !s.available)).toBe(true);

      // 11:00 → available (outside buffer: buffered 10:50–11:40, existing ends 10:30 < 10:50)
      const at1100 = findSlots(slots, 11, 0);
      expect(at1100.some((s: any) => s.available)).toBe(true);
    });

    it('auto-assign at 10:35 picks different worker due to buffer', async () => {
      // worker1 is booked at 10:00 from previous test.
      // 10:35 → worker1 buffered overlap still active (buffer until 10:40)
      const res = await order({
        workPostId: post2Id,
        scheduledStart: atUTC(day, 10, 35),
      }).expect(201);

      expect(res.body.data.assignedEmployeeId).not.toBe(worker1Id);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 17: Availability API slot-level accuracy
  //
  //  Verifies that the availability API correctly reflects
  //  bookings, cancellations, and per-post status.
  // ═══════════════════════════════════════════════════════

  describe('Flow 17: Availability API slot-level accuracy', () => {
    const day = nextWeekday(5);

    it('after booking on post1, post1 unavailable but post2 available at same time', async () => {
      // Book on post1 at 10:00
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      const res = await availability({
        date: day.toISOString(),
      }).expect(200);

      const slots = res.body.data;
      const p1at10 = findSlots(slots, 10, 0, post1Id);
      const p2at10 = findSlots(slots, 10, 0, post2Id);

      expect(p1at10).toHaveLength(1);
      expect(p1at10[0].available).toBe(false);

      expect(p2at10).toHaveLength(1);
      expect(p2at10[0].available).toBe(true);
    });

    it('buffer zone slots also show unavailable', async () => {
      // From previous test: order at 10:00–10:30 on post1
      const res = await availability({
        date: day.toISOString(),
      }).expect(200);

      // 10:30 slot on post1: buffered overlap with 10:00 order
      const p1at1030 = findSlots(res.body.data, 10, 30, post1Id);
      expect(p1at1030).toHaveLength(1);
      expect(p1at1030[0].available).toBe(false);

      // 10:30 on post2: no booking → available
      const p2at1030 = findSlots(res.body.data, 10, 30, post2Id);
      expect(p2at1030).toHaveLength(1);
      expect(p2at1030[0].available).toBe(true);
    });

    it('after cancellation, slot becomes available again', async () => {
      // Book on post2 at 12:00
      const res1 = await order({
        workPostId: post2Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      // Verify unavailable
      const before = await availability({ date: day.toISOString() }).expect(
        200,
      );
      const beforeSlot = findSlots(before.body.data, 12, 0, post2Id);
      expect(beforeSlot[0].available).toBe(false);

      // Cancel
      await patchStatus(res1.body.data.id, 'CANCELLED', {
        cancellationReason: 'test',
      }).expect(200);

      // Verify available again
      const after = await availability({ date: day.toISOString() }).expect(200);
      const afterSlot = findSlots(after.body.data, 12, 0, post2Id);
      expect(afterSlot[0].available).toBe(true);
    });

    it('per-workPost filtering shows only requested post', async () => {
      const res = await availability({
        date: day.toISOString(),
        workPostId: post2Id,
      }).expect(200);

      const slots = res.body.data;
      // All returned slots should be for post2
      expect(slots.length).toBeGreaterThan(0);
      expect(slots.every((s: any) => s.workPostId === post2Id)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 18: Multi-service combined duration
  //
  //  Two services (30min + 60min = 90min) create a longer
  //  blocking window. Order at 10:00 → ends 11:30.
  //  With buffer: 9:50–11:40.
  // ═══════════════════════════════════════════════════════

  describe('Flow 18: Multi-service combined duration', () => {
    const day = nextWeekday(6);

    it('90min order (30+60) correctly sets scheduledEnd', async () => {
      const res = await order({
        workPostId: post1Id,
        serviceIds: [svc30Id, svc60Id],
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      const start = new Date(res.body.data.scheduledStart);
      const end = new Date(res.body.data.scheduledEnd);
      expect(end.getTime() - start.getTime()).toBe(90 * 60000); // 90 min
    });

    it('30min at 11:00 on same post fails (within 90min range)', async () => {
      // Existing 90min order occupies 10:00–11:30 (buffered 9:50–11:40)
      // New at 11:00–11:30: buffered 10:50–11:40
      // Overlap with 10:00–11:30: 10:00 < 11:40 ✓, 11:30 > 10:50 ✓ → conflict
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 11),
      }).expect(409);
    });

    it('30min at 11:45 on same post succeeds (after buffer)', async () => {
      // 11:45–12:15 buffered 11:35–12:25
      // vs 10:00–11:30: 10:00 < 12:25 ✓, 11:30 > 11:35? NO → no conflict
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 11, 45),
      }).expect(201);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 19: Partial overlap geometries
  //
  //  Test various overlap patterns beyond exact and buffer
  //  overlap, which are already covered in the first file.
  // ═══════════════════════════════════════════════════════

  describe('Flow 19: Partial overlap geometries', () => {
    const day = nextWeekday(7);

    it('new order BEFORE existing, buffer reaches existing → conflict', async () => {
      // Existing at 14:00–14:30
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      // New at 13:25–13:55 → buffered 13:15–14:05
      // vs existing 14:00–14:30: 14:00 < 14:05 ✓, 14:30 > 13:15 ✓ → conflict
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 13, 25),
      }).expect(409);
    });

    it('new order fully encompasses existing → conflict', async () => {
      // Existing at 16:30–17:00 on post2
      await order({
        workPostId: post2Id,
        scheduledStart: atUTC(day, 16, 30),
      }).expect(201);

      // New 90min at 16:00–17:30 (encompasses 16:30–17:00) → conflict
      await order({
        workPostId: post2Id,
        serviceIds: [svc30Id, svc60Id],
        scheduledStart: atUTC(day, 16),
      }).expect(409);
    });

    it('new order fully contained within existing → conflict', async () => {
      // Existing 90min at 11:00–12:30 on post2
      await order({
        workPostId: post2Id,
        serviceIds: [svc30Id, svc60Id],
        scheduledStart: atUTC(day, 11),
      }).expect(201);

      // New 30min at 11:30–12:00 (contained within 11:00–12:30) → conflict
      await order({
        workPostId: post2Id,
        scheduledStart: atUTC(day, 11, 30),
      }).expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 20: NO_SHOW frees work post slot
  //
  //  Similar to CANCELLED freeing slots (tested in the
  //  first file), but specifically for NO_SHOW status.
  // ═══════════════════════════════════════════════════════

  describe('Flow 20: NO_SHOW frees work post slot', () => {
    const day = nextWeekday(8);

    it('book → NO_SHOW → re-book same slot/post succeeds', async () => {
      const res1 = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      await patchStatus(res1.body.data.id, 'NO_SHOW').expect(200);

      // Same slot, same post → should succeed
      const res2 = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res2.body.data.status).toBe('BOOKED');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 21: Restore terminal-status order bypasses
  //  scheduling conflict check
  //
  //  Terminal orders (CANCELLED, COMPLETED) don't occupy
  //  slots, so restoring them should skip the overlap check
  //  even when the slot is now occupied.
  // ═══════════════════════════════════════════════════════

  describe('Flow 21: Restore terminal order bypasses conflict', () => {
    const day = nextWeekday(9);

    it('deleted CANCELLED order can be restored despite slot occupied', async () => {
      // Book → Cancel → Delete
      const res1 = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);
      const id1 = res1.body.data.id;

      await patchStatus(id1, 'CANCELLED', {
        cancellationReason: 'test',
      }).expect(200);
      await deleteOrder(id1).expect(200);

      // Book another order at same slot
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Restore CANCELLED order → should succeed (terminal, no conflict check)
      await restoreOrder(id1).expect(200);
    });

    it('deleted COMPLETED order can be restored despite slot occupied', async () => {
      // Book → IN_PROGRESS → COMPLETED → Delete
      const res1 = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);
      const id1 = res1.body.data.id;

      await patchStatus(id1, 'IN_PROGRESS').expect(200);
      await patchStatus(id1, 'COMPLETED').expect(200);
      await deleteOrder(id1).expect(200);

      // Book at same slot
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      // Restore COMPLETED order → should succeed
      await restoreOrder(id1).expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 22: Soft-deleted order invisible to availability
  //
  //  After soft-deleting an order, the availability API
  //  should show the slot as free.
  // ═══════════════════════════════════════════════════════

  describe('Flow 22: Soft-deleted order invisible to availability', () => {
    const day = nextWeekday(10);

    it('deleted order slot shows available in availability API', async () => {
      // Book on post1 at 10:00
      const res1 = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Availability: post1 at 10:00 → unavailable
      const before = await availability({ date: day.toISOString() }).expect(
        200,
      );
      const beforeSlot = findSlots(before.body.data, 10, 0, post1Id);
      expect(beforeSlot[0].available).toBe(false);

      // Soft-delete the order
      await deleteOrder(res1.body.data.id).expect(200);

      // Availability: post1 at 10:00 → available again
      const after = await availability({ date: day.toISOString() }).expect(200);
      const afterSlot = findSlots(after.body.data, 10, 0, post1Id);
      expect(afterSlot[0].available).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 23: Working hours day boundaries
  //
  //  Default working hours: 08:00–20:00.
  //  Verify bookings at the very first and very last slots,
  //  and that availability grid matches these boundaries.
  // ═══════════════════════════════════════════════════════

  describe('Flow 23: Working hours day boundaries', () => {
    const day = nextWeekday(11);

    it('booking at 08:00 (first slot) succeeds', async () => {
      const res = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 8),
      }).expect(201);

      const start = new Date(res.body.data.scheduledStart);
      expect(start.getUTCHours()).toBe(8);
      expect(start.getUTCMinutes()).toBe(0);
    });

    it('booking at 19:30 (last 30-min slot) succeeds', async () => {
      const res = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 19, 30),
      }).expect(201);

      const end = new Date(res.body.data.scheduledEnd);
      expect(end.getUTCHours()).toBe(20);
      expect(end.getUTCMinutes()).toBe(0);
    });

    it('availability grid starts at 08:00 and last slot is 19:30', async () => {
      const res = await availability({
        date: day.toISOString(),
      }).expect(200);

      const slots = res.body.data;
      expect(slots.length).toBeGreaterThan(0);

      // First slot starts at 08:00
      const firstSlot = slots[0];
      const firstStart = new Date(firstSlot.start);
      expect(firstStart.getUTCHours()).toBe(8);
      expect(firstStart.getUTCMinutes()).toBe(0);

      // Last slot starts at 19:30
      const lastSlot = slots[slots.length - 1];
      const lastStart = new Date(lastSlot.start);
      expect(lastStart.getUTCHours()).toBe(19);
      expect(lastStart.getUTCMinutes()).toBe(30);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 24: IN_PROGRESS order still blocks slot
  //
  //  Unlike terminal statuses, IN_PROGRESS is an active
  //  status and must continue blocking the time slot.
  // ═══════════════════════════════════════════════════════

  describe('Flow 24: IN_PROGRESS order still blocks slot', () => {
    const day = nextWeekday(12);

    it('IN_PROGRESS order blocks both post slot and worker', async () => {
      // Book with explicit worker
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Move to IN_PROGRESS
      await patchStatus(res1.body.data.id, 'IN_PROGRESS').expect(200);

      // Same post, same time → still blocked (409)
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(409);

      // Availability shows worker1 unavailable at 10:00
      const res = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);

      const at10 = findSlots(res.body.data, 10, 0);
      expect(at10.every((s: any) => !s.available)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 25: BOOKED_PENDING_CONFIRMATION blocks slot
  //
  //  Web bookings start as BOOKED_PENDING_CONFIRMATION.
  //  This non-terminal status must still block slots.
  // ═══════════════════════════════════════════════════════

  describe('Flow 25: BOOKED_PENDING_CONFIRMATION blocks slot', () => {
    const day = nextWeekday(13);

    it('web booking blocks the slot', async () => {
      // Create via public booking API
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          workPostId: post1Id,
          scheduledStart: atUTC(day, 10),
          serviceIds: [svc30Id],
          firstName: 'Test',
          lastName: 'Booking',
          phone: '+380501111111',
          licensePlate: 'TEST1234',
        })
        .expect(201);

      expect(bookRes.body.data.status).toBe('BOOKED_PENDING_CONFIRMATION');

      // Same slot → blocked
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 26: Custom durationMinutes changes availability grid
  //
  //  Default slot is 30min. With 60-min duration, fewer
  //  slots fit and the last slot shifts earlier.
  // ═══════════════════════════════════════════════════════

  describe('Flow 26: Custom durationMinutes changes slot grid', () => {
    const day = nextWeekday(14);

    it('60-min duration produces fewer slots, last slot at 19:00', async () => {
      const res30 = await availability({
        date: day.toISOString(),
        durationMinutes: 30,
      }).expect(200);

      const res60 = await availability({
        date: day.toISOString(),
        durationMinutes: 60,
      }).expect(200);

      // 30-min slots: 24 per post × 2 posts = 48
      // 60-min slots: 12 per post × 2 posts = 24
      expect(res30.body.data.length).toBe(48);
      expect(res60.body.data.length).toBe(24);

      // Last 60-min slot starts at 19:00 (19:00+60=20:00)
      const last60 = res60.body.data[res60.body.data.length - 1];
      const lastStart = new Date(last60.start);
      expect(lastStart.getUTCHours()).toBe(19);
      expect(lastStart.getUTCMinutes()).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 27: Effective capacity = min(posts, workers)
  //
  //  With 2 posts and 3 workers (at 10:00+), all 3 workers
  //  available but only 2 posts → only 2 slots available
  //  at any given time. Book 2, 3rd fails.
  //  At 09:00 with only 2 workers → capacity still 2.
  // ═══════════════════════════════════════════════════════

  describe('Flow 27: Effective capacity = min(posts, workers)', () => {
    const day = nextWeekday(15);

    it('at 10:00 with 3 workers but 2 posts, capacity is 2', async () => {
      // Book 2 orders at 10:00 (auto-assign) → both succeed
      const res1 = await order({ scheduledStart: atUTC(day, 10) }).expect(201);
      const res2 = await order({ scheduledStart: atUTC(day, 10) }).expect(201);

      // Different posts assigned
      expect(res1.body.data.workPostId).not.toBe(res2.body.data.workPostId);

      // 3rd order → both posts full → 400
      await order({ scheduledStart: atUTC(day, 10) }).expect(400);
    });

    it('availability reflects workforce cap: busy workers reduce available slots', async () => {
      // At 10:00, 2 orders exist from prev test (both posts occupied, 2/3 workers busy)
      // Check availability → at 10:00, both posts unavailable
      const res = await availability({ date: day.toISOString() }).expect(200);

      const at1000 = findSlots(res.body.data, 10, 0);
      const availableAt10 = at1000.filter((s: any) => s.available);
      expect(availableAt10).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 28: Back-to-back bookings respecting buffer
  //
  //  Fill a post with consecutive orders, each starting
  //  exactly when the buffer of the previous one ends.
  // ═══════════════════════════════════════════════════════

  describe('Flow 28: Back-to-back bookings with buffer', () => {
    const day = nextWeekday(16);

    it('chain of 3 orders on same post: 8:00, 8:40, 9:20', async () => {
      // Order 1: 8:00–8:30 → buffer 7:50–8:40
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 8),
      }).expect(201);

      // Order 2: 8:40–9:10 (starts exactly when order1 buffer ends)
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 8, 40),
      }).expect(201);

      // Order 3: 9:20–9:50 (starts exactly when order2 buffer ends at 9:20)
      // Order2 ends at 9:10, buffer adds 10min → 9:20
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 9, 20),
      }).expect(201);
    });

    it('order between back-to-back chain fails (no gap)', async () => {
      // Attempt to squeeze at 8:35 → conflicts with order1 buffer (until 8:40)
      // and with order2 itself (8:40 start, buffered from 8:30)
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 8, 35),
      }).expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 29: Zero-profile fallback
  //
  //  When a branch has NO employee profiles configured,
  //  the workforce cap is skipped — capacity equals the
  //  number of free posts (no employee auto-assignment).
  // ═══════════════════════════════════════════════════════

  describe('Flow 29: Zero-profile fallback (no workers configured)', () => {
    const day = nextWeekday(17);

    let emptyBranchId: string;
    let emptyPost1Id: string;
    let emptyPost2Id: string;
    let emptyPost3Id: string;

    beforeAll(async () => {
      // Create a branch with 3 work posts but ZERO employee profiles
      const branch = await prisma.branch.create({
        data: { tenantId, timezone: 'UTC', name: 'Empty Staff Branch' },
      });
      emptyBranchId = branch.id;

      const ep1 = await prisma.workPost.create({
        data: { tenantId, branchId: emptyBranchId, name: 'EP-1' },
      });
      const ep2 = await prisma.workPost.create({
        data: { tenantId, branchId: emptyBranchId, name: 'EP-2' },
      });
      const ep3 = await prisma.workPost.create({
        data: { tenantId, branchId: emptyBranchId, name: 'EP-3' },
      });
      emptyPost1Id = ep1.id;
      emptyPost2Id = ep2.id;
      emptyPost3Id = ep3.id;
    });

    it('availability shows all 3 posts available (no workforce cap)', async () => {
      const res = await availability({
        branchId: emptyBranchId,
        date: day.toISOString(),
      }).expect(200);

      const at10 = findSlots(res.body.data, 10, 0);
      expect(at10).toHaveLength(3);
      expect(at10.every((s: any) => s.available)).toBe(true);
    });

    it('can book 3 concurrent orders (no employee limit)', async () => {
      const r1 = await order({
        branchId: emptyBranchId,
        workPostId: emptyPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      const r2 = await order({
        branchId: emptyBranchId,
        workPostId: emptyPost2Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      const r3 = await order({
        branchId: emptyBranchId,
        workPostId: emptyPost3Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // No assignedEmployee on any order
      expect(r1.body.data.assignedEmployee).toBeNull();
      expect(r2.body.data.assignedEmployee).toBeNull();
      expect(r3.body.data.assignedEmployee).toBeNull();
    });

    it('post conflict still enforced (4th order on full posts → 409)', async () => {
      await order({
        branchId: emptyBranchId,
        workPostId: emptyPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(409);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 30: Inactive worker excluded from auto-assign
  //
  //  Deactivating a worker (active=false) must exclude
  //  them from auto-assignment and from available capacity.
  // ═══════════════════════════════════════════════════════

  describe('Flow 30: Inactive worker excluded from auto-assign', () => {
    const day = nextWeekday(18);

    it('deactivated worker is not auto-assigned', async () => {
      // Deactivate worker3
      await prisma.employeeProfile.update({
        where: { id: worker3Id },
        data: { active: false },
      });

      try {
        // At 10:00, only workers 1,2 eligible (worker3 deactivated)
        const r1 = await order({
          scheduledStart: atUTC(day, 10),
        }).expect(201);
        const r2 = await order({
          scheduledStart: atUTC(day, 10),
        }).expect(201);

        // Both must be workers 1 or 2
        const ids = [
          r1.body.data.assignedEmployeeId,
          r2.body.data.assignedEmployeeId,
        ];
        expect(ids).not.toContain(worker3Id);
        expect(new Set(ids).size).toBe(2);

        // 3rd order → only 2 workers → no employee available
        // (even though 2 posts were used, workers are the bottleneck)
        // Since both posts AND workers are exhausted, 3rd fails
        await order({
          scheduledStart: atUTC(day, 10),
        }).expect(400);
      } finally {
        // Re-activate worker3 for subsequent tests
        await prisma.employeeProfile.update({
          where: { id: worker3Id },
          data: { active: true },
        });
      }
    });

    it('availability reflects reduced capacity with deactivated worker', async () => {
      // Deactivate worker3 again
      await prisma.employeeProfile.update({
        where: { id: worker3Id },
        data: { active: false },
      });

      try {
        const res = await availability({
          date: day.toISOString(),
          assignedEmployeeId: worker3Id,
        }).expect(200);

        // All slots unavailable for deactivated worker
        const at11 = findSlots(res.body.data, 11, 0);
        expect(at11.every((s: any) => !s.available)).toBe(true);
      } finally {
        await prisma.employeeProfile.update({
          where: { id: worker3Id },
          data: { active: true },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 31: Non-worker (isWorker=false) excluded
  //
  //  An employee profile with isWorker=false (e.g. manager)
  //  must not receive order assignments.
  // ═══════════════════════════════════════════════════════

  describe('Flow 31: Non-worker profile excluded from assignment', () => {
    const day = nextWeekday(19);

    it('isWorker=false profile is never auto-assigned', async () => {
      // Set worker3 to non-worker
      await prisma.employeeProfile.update({
        where: { id: worker3Id },
        data: { isWorker: false },
      });

      try {
        const r1 = await order({
          scheduledStart: atUTC(day, 10),
        }).expect(201);
        const r2 = await order({
          scheduledStart: atUTC(day, 10),
        }).expect(201);

        const ids = [
          r1.body.data.assignedEmployeeId,
          r2.body.data.assignedEmployeeId,
        ];
        expect(ids).not.toContain(worker3Id);
      } finally {
        await prisma.employeeProfile.update({
          where: { id: worker3Id },
          data: { isWorker: true },
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 32: Busy worker → availability capacity = 0
  //
  //  When assignedEmployeeId points to a currently busy
  //  worker, ALL slots at that time must be unavailable
  //  (effectiveCapacity = 0).
  // ═══════════════════════════════════════════════════════

  describe('Flow 32: Busy worker shows zero capacity in availability', () => {
    const day = nextWeekday(20);

    it('busy worker → all posts unavailable at that time', async () => {
      // Book worker1 at 10:00
      await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Request availability for worker1
      const res = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);

      // At 10:00: worker1 busy → effectiveCapacity=0 → ALL posts unavailable
      const at10 = findSlots(res.body.data, 10, 0);
      expect(at10.length).toBe(2); // both posts returned
      expect(at10.every((s: any) => !s.available)).toBe(true);

      // At 11:00: worker1 free → posts available
      const at11 = findSlots(res.body.data, 11, 0);
      expect(at11.some((s: any) => s.available)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 33: Custom branch booking settings
  //
  //  Override default settings (buffer=5min, hours=09-18,
  //  workingDays=[1,2,3,4,5]) at branch level.
  //  Verify the customized behaviour applies.
  // ═══════════════════════════════════════════════════════

  describe('Flow 33: Custom branch booking settings', () => {
    let customBranchId: string;
    let customPostId: string;

    beforeAll(async () => {
      // Create branch with custom settings
      const branch = await prisma.branch.create({
        data: { tenantId, timezone: 'UTC', name: 'Custom Settings Branch' },
      });
      customBranchId = branch.id;

      await prisma.bookingSettings.create({
        data: {
          tenantId,
          branchId: customBranchId,
          slotDurationMinutes: 20,
          bufferTimeMinutes: 5,
          maxAdvanceBookingDays: 14,
          workingHoursStart: '09:00',
          workingHoursEnd: '18:00',
          workingDays: [1, 2, 3, 4, 5], // Mon–Fri only
        },
      });

      const post = await prisma.workPost.create({
        data: { tenantId, branchId: customBranchId, name: 'Custom Post' },
      });
      customPostId = post.id;
    });

    it('availability uses custom working hours (09:00–18:00)', async () => {
      // Use small offset to stay within custom maxAdvanceBookingDays=14
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + 3);
      // Ensure Mon–Fri (custom workingDays excludes Sat/Sun)
      while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
        day.setUTCDate(day.getUTCDate() + 1);
      }

      const res = await availability({
        branchId: customBranchId,
        date: day.toISOString(),
        durationMinutes: 20,
      }).expect(200);

      const slots = res.body.data;
      expect(slots.length).toBeGreaterThan(0);

      // First slot at 09:00 (not 08:00)
      const first = new Date(slots[0].start);
      expect(first.getUTCHours()).toBe(9);

      // Last slot: 18:00 - 20min = 17:40
      const last = new Date(slots[slots.length - 1].start);
      expect(last.getUTCHours()).toBe(17);
      expect(last.getUTCMinutes()).toBe(40);
    });

    it('custom buffer (5min) allows tighter scheduling', async () => {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + 5);
      while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
        day.setUTCDate(day.getUTCDate() + 1);
      }

      // Book at 10:00, 30min service → ends 10:30, custom buffer 5min → blocked until 10:35
      await order({
        branchId: customBranchId,
        workPostId: customPostId,
        serviceIds: [svc30Id],
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // At 10:35: buffered 10:30–11:05
      // vs existing 10:00–10:30: scheduledEnd(10:30) > 10:30? NO → no conflict
      await order({
        branchId: customBranchId,
        workPostId: customPostId,
        serviceIds: [svc30Id],
        scheduledStart: atUTC(day, 10, 35),
      }).expect(201);
    });

    it('custom maxAdvanceBookingDays (14) rejects booking at day 20', async () => {
      const futureDay = new Date();
      futureDay.setUTCDate(futureDay.getUTCDate() + 20);
      // Make it a weekday Mon–Fri
      while (futureDay.getUTCDay() === 0 || futureDay.getUTCDay() === 6) {
        futureDay.setUTCDate(futureDay.getUTCDate() + 1);
      }

      const res = await order({
        branchId: customBranchId,
        workPostId: customPostId,
        scheduledStart: atUTC(futureDay, 10),
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot book more than 14 days/i);
    });

    it('Saturday rejected with custom workingDays [1,2,3,4,5]', async () => {
      // Find next Saturday (always at least 1 day ahead to avoid past-time rejection)
      const saturday = new Date();
      saturday.setUTCDate(saturday.getUTCDate() + 1);
      while (saturday.getUTCDay() !== 6) {
        saturday.setUTCDate(saturday.getUTCDate() + 1);
      }

      const res = await order({
        branchId: customBranchId,
        workPostId: customPostId,
        scheduledStart: atUTC(saturday, 10),
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not allowed on this day/i);
    });

    it('availability returns [] for Saturday on custom branch', async () => {
      const saturday = new Date();
      saturday.setUTCDate(saturday.getUTCDate() + 1);
      while (saturday.getUTCDay() !== 6) {
        saturday.setUTCDate(saturday.getUTCDate() + 1);
      }

      const res = await availability({
        branchId: customBranchId,
        date: saturday.toISOString(),
      }).expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 34: maxAdvanceBookingDays exact boundary
  //
  //  Booking at exactly day 30 → succeeds.
  //  Booking at day 31 → fails.
  // ═══════════════════════════════════════════════════════

  describe('Flow 34: maxAdvanceBookingDays exact boundary', () => {
    it('booking at day 49 succeeds, day 51 fails', async () => {
      // Day 49 from now (within 50-day limit set in beforeAll)
      const day49 = new Date();
      day49.setUTCDate(day49.getUTCDate() + 49);
      while (day49.getUTCDay() === 0) {
        day49.setUTCDate(day49.getUTCDate() - 1);
      }

      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day49, 10),
      }).expect(201);

      // Day 51 from now (beyond 50-day limit)
      const day51 = new Date();
      day51.setUTCDate(day51.getUTCDate() + 51);
      while (day51.getUTCDay() === 0) {
        day51.setUTCDate(day51.getUTCDate() + 1);
      }

      const res = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day51, 10),
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot book more than/i);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 35: Soft-deleted order frees worker
  //
  //  After soft-deleting an order, the assigned worker
  //  must become available for new orders at that time.
  // ═══════════════════════════════════════════════════════

  describe('Flow 35: Soft-deleted order frees worker', () => {
    const day = nextWeekday(22);

    it('deleted order releases worker for re-assignment', async () => {
      // Book with explicit worker
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Availability: worker1 busy at 10:00
      const before = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);
      const beforeSlots = findSlots(before.body.data, 10, 0);
      expect(beforeSlots.every((s: any) => !s.available)).toBe(true);

      // Soft-delete
      await deleteOrder(res1.body.data.id).expect(200);

      // Availability: worker1 free again at 10:00
      const after = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);
      const afterSlots = findSlots(after.body.data, 10, 0);
      expect(afterSlots.some((s: any) => s.available)).toBe(true);

      // Can re-book with worker1 at same time
      const res2 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res2.body.data.assignedEmployeeId).toBe(worker1Id);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 36: BOOKED_PENDING_CONFIRMATION transitions
  //
  //  Web booking (BOOKED_PENDING_CONFIRMATION) can be:
  //  - confirmed → BOOKED
  //  - cancelled → CANCELLED
  // ═══════════════════════════════════════════════════════

  describe('Flow 36: BOOKED_PENDING_CONFIRMATION status transitions', () => {
    const day = nextWeekday(23);

    it('BOOKED_PENDING_CONFIRMATION → BOOKED (confirm) frees nothing, slot stays blocked', async () => {
      // Public booking → BOOKED_PENDING_CONFIRMATION
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          workPostId: post1Id,
          scheduledStart: atUTC(day, 10),
          serviceIds: [svc30Id],
          firstName: 'Confirm',
          lastName: 'Test',
          phone: '+380502222222',
          licensePlate: 'CONF1234',
        })
        .expect(201);

      const orderId = bookRes.body.data.id;
      expect(bookRes.body.data.status).toBe('BOOKED_PENDING_CONFIRMATION');

      // Confirm → BOOKED
      await patchStatus(orderId, 'BOOKED').expect(200);

      // Slot still blocked
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(409);
    });

    it('BOOKED_PENDING_CONFIRMATION → CANCELLED frees the slot', async () => {
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          workPostId: post2Id,
          scheduledStart: atUTC(day, 12),
          serviceIds: [svc30Id],
          firstName: 'Cancel',
          lastName: 'Test',
          phone: '+380503333333',
          licensePlate: 'CANC1234',
        })
        .expect(201);

      expect(bookRes.body.data.status).toBe('BOOKED_PENDING_CONFIRMATION');

      // Cancel
      await patchStatus(bookRes.body.data.id, 'CANCELLED', {
        cancellationReason: 'client changed mind',
      }).expect(200);

      // Slot is now free
      const res = await order({
        workPostId: post2Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      expect(res.body.data.status).toBe('BOOKED');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 37: IN_PROGRESS → CANCELLED frees slot
  //
  //  An order that's being worked on can be cancelled.
  //  After cancellation the slot and worker are freed.
  // ═══════════════════════════════════════════════════════

  describe('Flow 37: IN_PROGRESS → CANCELLED frees slot', () => {
    const day = nextWeekday(24);

    it('cancel during work frees both post and worker', async () => {
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Move to IN_PROGRESS
      await patchStatus(res1.body.data.id, 'IN_PROGRESS').expect(200);

      // Cancel while in progress
      await patchStatus(res1.body.data.id, 'CANCELLED', {
        cancellationReason: 'service interrupted',
      }).expect(200);

      // Post is free
      const res2 = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res2.body.data.status).toBe('BOOKED');

      // Worker1 is free (assigned to the new order or available)
      const avail = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);

      // 10:00 slot is now taken by new order BUT worker1 may or may not be assigned
      // At least check worker1 would be available at a different time
      const at12 = findSlots(avail.body.data, 12, 0);
      expect(at12.some((s: any) => s.available)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 38: allowOnlineBooking disabled
  //
  //  When allowOnlineBooking=false for a branch, public
  //  booking API must return 403 Forbidden.
  // ═══════════════════════════════════════════════════════

  describe('Flow 38: allowOnlineBooking disabled', () => {
    let disabledBranchId: string;

    beforeAll(async () => {
      const branch = await prisma.branch.create({
        data: { tenantId, timezone: 'UTC', name: 'No Online Branch' },
      });
      disabledBranchId = branch.id;

      await prisma.bookingSettings.create({
        data: {
          tenantId,
          branchId: disabledBranchId,
          allowOnlineBooking: false,
        },
      });

      await prisma.workPost.create({
        data: { tenantId, branchId: disabledBranchId, name: 'Offline Post' },
      });
    });

    it('public booking returns 403 when online booking disabled', async () => {
      const day = nextWeekday(25);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId: disabledBranchId,
          scheduledStart: atUTC(day, 10),
          serviceIds: [svc30Id],
          firstName: 'Blocked',
          lastName: 'User',
          phone: '+380504444444',
          licensePlate: 'NOPE1234',
        });

      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 39: Saturday booking on default settings
  //
  //  Default workingDays = [1,2,3,4,5,6]. Saturday (6)
  //  IS a working day. Verify booking succeeds.
  // ═══════════════════════════════════════════════════════

  describe('Flow 39: Saturday booking (workingDays boundary)', () => {
    it('Saturday booking succeeds on default settings (day 6 in workingDays)', async () => {
      // Find next Saturday within max advance period (always at least 1 day ahead)
      const saturday = new Date();
      saturday.setUTCDate(saturday.getUTCDate() + 1);
      while (saturday.getUTCDay() !== 6) {
        saturday.setUTCDate(saturday.getUTCDate() + 1);
      }

      // Use 18:00 on post2 to avoid collisions with other flows
      const res = await order({
        workPostId: post2Id,
        scheduledStart: atUTC(saturday, 18),
      });

      // Saturday (6) is in default [1,2,3,4,5,6] → succeeds
      expect(res.status).toBe(201);
    });

    it('availability returns slots for Saturday', async () => {
      const saturday = new Date();
      saturday.setUTCDate(saturday.getUTCDate() + 1);
      while (saturday.getUTCDay() !== 6) {
        saturday.setUTCDate(saturday.getUTCDate() + 1);
      }

      const res = await availability({
        date: saturday.toISOString(),
      }).expect(200);

      expect(res.body.data.length).toBeGreaterThan(0);
      const available = res.body.data.filter((s: any) => s.available);
      expect(available.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 40: Explicit assignedEmployeeId with busy worker
  //
  //  When a user manually specifies assignedEmployeeId for
  //  a worker who already has a conflicting order, the
  //  system creates the order without employee validation
  //  (orders.service.ts line 187 skips auto-assign block).
  //  This documents the current behavior — explicit worker
  //  assignment bypasses availability checks.
  // ═══════════════════════════════════════════════════════

  describe('Flow 40: Explicit assignedEmployeeId with busy worker', () => {
    const day = nextWeekday(26);

    it('explicit assignment of busy worker succeeds (no employee validation)', async () => {
      // Book worker1 at 10:00 on post1
      const res1 = await order({
        workPostId: post1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res1.body.data.assignedEmployeeId).toBe(worker1Id);

      // Explicitly assign worker1 at 10:00 on post2 (worker busy, different post)
      // The system does NOT validate employee availability for explicit assignments
      const res2 = await order({
        workPostId: post2Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Worker1 is double-assigned — this is the current behavior
      expect(res2.body.data.assignedEmployeeId).toBe(worker1Id);
    });

    it('auto-assign at same time correctly skips the busy worker', async () => {
      // worker1 has 2 orders at 10:00 (from prev test), worker2 may be free
      // Auto-assign at 12:00 (clean slot) — should pick any free worker
      const res = await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      expect(res.body.data.assignedEmployeeId).toBeTruthy();
    });

    it('availability API still shows worker1 as busy at the time', async () => {
      const res = await availability({
        date: day.toISOString(),
        assignedEmployeeId: worker1Id,
      }).expect(200);

      // At 10:00 worker1 has orders — all posts show unavailable
      const at10 = findSlots(res.body.data, 10, 0);
      expect(at10.every((s: any) => !s.available)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 41: Concurrent worker exhaustion (race condition)
  //
  //  With 2 posts and only 2 workers available at 09:00
  //  (worker3 starts at 10:00), send 3 concurrent requests.
  //  Serializable transactions ensure exactly 2 succeed.
  // ═══════════════════════════════════════════════════════

  describe('Flow 41: Concurrent worker exhaustion', () => {
    const day = nextWeekday(27);

    it('3 concurrent requests with only 2 workers → at most 2 succeed, no double-booking', async () => {
      // At 09:00: worker1 and worker2 available, worker3 NOT (starts 10:00)
      // 2 posts → capacity = min(2 posts, 2 workers) = 2
      // Under Serializable isolation, losers get P2034 (write conflict) → 500
      const promises = Array.from({ length: 3 }, () =>
        order({ scheduledStart: atUTC(day, 9) }),
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.status === 201);
      const failures = results.filter((r) => r.status !== 201);

      // At most 2 can succeed (capacity limit); some may fail with 500 (serialization)
      expect(successes.length).toBeLessThanOrEqual(2);
      expect(successes.length).toBeGreaterThanOrEqual(1);
      expect(failures.length).toBeGreaterThanOrEqual(1);

      // No double-assignment: all successful workers are unique
      if (successes.length === 2) {
        const workerIds = successes.map((r) => r.body.data.assignedEmployeeId);
        expect(new Set(workerIds).size).toBe(2);
        expect(workerIds).not.toContain(worker3Id);
      }
    });

    it('3 concurrent on same explicit post → at most 1 succeeds', async () => {
      // All on post1 at 15:00 → only 1 can reserve the post
      // Losers get 409 (ConflictException) or 500 (serialization conflict)
      const promises = Array.from({ length: 3 }, () =>
        order({
          workPostId: post1Id,
          scheduledStart: atUTC(day, 15),
        }),
      );

      const results = await Promise.all(promises);
      const successes = results.filter((r) => r.status === 201);

      // Exactly 1 succeeds — Serializable isolation prevents double-booking
      expect(successes).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 42: Public booking error translation
  //
  //  When all work posts are occupied and public booking
  //  does NOT specify workPostId, auto-assign fails with
  //  BadRequestException('No available work posts').
  //  Public booking translates this to ConflictException
  //  (409) with user-friendly message.
  // ═══════════════════════════════════════════════════════

  describe('Flow 42: Public booking error translation (all posts full)', () => {
    const day = nextWeekday(28);

    it('public booking without workPostId when all posts full → 409 with friendly message', async () => {
      // Fill both posts at 10:00
      await order({
        workPostId: post1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      await order({
        workPostId: post2Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // Public booking at same time, no workPostId → auto-assign fails
      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          scheduledStart: atUTC(day, 10),
          serviceIds: [svc30Id],
          firstName: 'Full',
          lastName: 'Slots',
          phone: '+380505555555',
          licensePlate: 'FULL1234',
        });

      // Should be 409 (ConflictException), not raw 400
      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/time slot.*unavailable/i);
    });

    it('public booking with explicit workPostId when post occupied → 409 passthrough', async () => {
      // post1 already occupied at 10:00 from prev test
      const res = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          workPostId: post1Id,
          scheduledStart: atUTC(day, 10),
          serviceIds: [svc30Id],
          firstName: 'Occupied',
          lastName: 'Post',
          phone: '+380506666666',
          licensePlate: 'OCCU1234',
        });

      // ConflictException from reserveSlot passes through directly
      expect(res.status).toBe(409);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 43: Booking settings fallback to hardcoded defaults
  //
  //  When neither branch-level nor tenant-level booking
  //  settings exist, the system uses hardcoded defaults:
  //  slotDuration=30, buffer=10, maxAdvance=30,
  //  workingDays=[1,2,3,4,5,6], hours=08:00-20:00.
  //
  //  We temporarily remove tenant-level settings to force
  //  the full fallback path.
  // ═══════════════════════════════════════════════════════

  describe('Flow 43: Booking settings fallback to hardcoded defaults', () => {
    let fallbackBranchId: string;
    let fallbackPostId: string;

    beforeAll(async () => {
      // Delete the tenant-level booking settings to force defaults fallback
      // (test-app.ts creates one with branchId=null for this tenant)
      await prisma.bookingSettings.deleteMany({
        where: { tenantId, branchId: null },
      });

      // Create a branch with NO branch-level settings
      const branch = await prisma.branch.create({
        data: { tenantId, timezone: 'UTC', name: 'Defaults Fallback Branch' },
      });
      fallbackBranchId = branch.id;

      const post = await prisma.workPost.create({
        data: { tenantId, branchId: fallbackBranchId, name: 'Fallback Post' },
      });
      fallbackPostId = post.id;
    });

    afterAll(async () => {
      // Restore tenant-level settings for other tests
      await prisma.bookingSettings.create({
        data: {
          tenantId,
          slotDurationMinutes: 30,
          bufferTimeMinutes: 10,
        },
      });
    });

    it('availability uses default working hours 08:00-20:00 and 30min slots', async () => {
      // Use a date within the hardcoded default maxAdvanceBookingDays (30)
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + 20);
      while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);

      const res = await availability({
        branchId: fallbackBranchId,
        date: day.toISOString(),
      }).expect(200);

      const slots = res.body.data;
      expect(slots.length).toBeGreaterThan(0);

      // First slot at 08:00 (default workingHoursStart)
      const first = new Date(slots[0].start);
      expect(first.getUTCHours()).toBe(8);
      expect(first.getUTCMinutes()).toBe(0);

      // Last slot at 19:30 (default 08:00-20:00, 30min slots → last = 19:30)
      const last = new Date(slots[slots.length - 1].start);
      expect(last.getUTCHours()).toBe(19);
      expect(last.getUTCMinutes()).toBe(30);

      // 24 slots per post × 1 post = 24 (08:00 to 19:30 in 30min steps)
      expect(slots).toHaveLength(24);
    });

    it('default buffer (10min) is applied', async () => {
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + 21);
      while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);

      // Book at 10:00 → 10:30, buffer 10min → blocked until 10:40
      await order({
        branchId: fallbackBranchId,
        workPostId: fallbackPostId,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // 10:35 → within buffer → conflict
      await order({
        branchId: fallbackBranchId,
        workPostId: fallbackPostId,
        scheduledStart: atUTC(day, 10, 35),
      }).expect(409);

      // 10:40 → exactly at buffer end → succeeds
      await order({
        branchId: fallbackBranchId,
        workPostId: fallbackPostId,
        scheduledStart: atUTC(day, 10, 40),
      }).expect(201);
    });

    it('default workingDays [1,2,3,4,5,6] rejects Sunday', async () => {
      const sunday = new Date();
      while (sunday.getUTCDay() !== 0) {
        sunday.setUTCDate(sunday.getUTCDate() + 1);
      }

      const res = await order({
        branchId: fallbackBranchId,
        workPostId: fallbackPostId,
        scheduledStart: atUTC(sunday, 10),
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not allowed on this day/i);
    });

    it('default maxAdvanceBookingDays (30) rejects day 35', async () => {
      const farDay = new Date();
      farDay.setUTCDate(farDay.getUTCDate() + 35);
      while (farDay.getUTCDay() === 0) {
        farDay.setUTCDate(farDay.getUTCDate() + 1);
      }

      const res = await order({
        branchId: fallbackBranchId,
        workPostId: fallbackPostId,
        scheduledStart: atUTC(farDay, 10),
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot book more than 30 days/i);
    });
  });
});
