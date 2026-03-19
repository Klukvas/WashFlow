import request from 'supertest';
import { App } from 'supertest/types';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanupTenant, TestSetup } from './helpers/test-app';

/**
 * Real-user-flow E2E tests for the scheduling & order system.
 *
 * These are NOT single-endpoint tests. Each `describe` simulates a full user
 * journey that spans multiple API calls, verifying that the system behaves
 * correctly across the entire flow.
 */

const SLUG = 'e2e-scheduling-flows';

describe('Scheduling Flows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;
  let branchId: string;

  // Shared test entities created during setup
  let workPost1Id: string;
  let workPost2Id: string;
  let clientId: string;
  let vehicleId: string;
  let service30minId: string;
  let service60minId: string;
  let worker1Id: string; // employeeProfile id
  let worker2Id: string;
  let worker1UserId: string;
  let worker2UserId: string;

  beforeAll(async () => {
    const setup: TestSetup = await createTestApp(SLUG);
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;
    branchId = setup.testBranch.id;

    // ── Create two work posts ──────────────────────────
    const wp1 = await prisma.workPost.create({
      data: { tenantId, branchId, name: 'Bay 1' },
    });
    const wp2 = await prisma.workPost.create({
      data: { tenantId, branchId, name: 'Bay 2' },
    });
    workPost1Id = wp1.id;
    workPost2Id = wp2.id;

    // ── Create services ────────────────────────────────
    const svc30 = await prisma.service.create({
      data: { tenantId, name: 'Quick Wash', durationMin: 30, price: 250 },
    });
    const svc60 = await prisma.service.create({
      data: { tenantId, name: 'Full Detail', durationMin: 60, price: 500 },
    });
    service30minId = svc30.id;
    service60minId = svc60.id;

    // ── Create client & vehicle ────────────────────────
    const client = await prisma.client.create({
      data: {
        tenantId,
        firstName: 'Ivan',
        lastName: 'Petrenko',
        phone: '+380991112233',
      },
    });
    clientId = client.id;

    const vehicle = await prisma.vehicle.create({
      data: { tenantId, clientId, make: 'Toyota', licensePlate: 'AA1234BB' },
    });
    vehicleId = vehicle.id;

    // ── Create two worker users + employee profiles ────
    const hash = await argon2.hash('password123');

    const user1 = await prisma.user.create({
      data: {
        tenantId,
        email: `worker1@${SLUG}.com`,
        passwordHash: hash,
        firstName: 'Worker',
        lastName: 'One',
      },
    });
    const user2 = await prisma.user.create({
      data: {
        tenantId,
        email: `worker2@${SLUG}.com`,
        passwordHash: hash,
        firstName: 'Worker',
        lastName: 'Two',
      },
    });
    worker1UserId = user1.id;
    worker2UserId = user2.id;

    const profile1 = await prisma.employeeProfile.create({
      data: {
        tenantId,
        userId: user1.id,
        branchId,
        isWorker: true,
        active: true,
        workStartTime: '08:00',
        workEndTime: '20:00',
      },
    });
    const profile2 = await prisma.employeeProfile.create({
      data: {
        tenantId,
        userId: user2.id,
        branchId,
        isWorker: true,
        active: true,
        workStartTime: '08:00',
        workEndTime: '20:00',
      },
    });
    worker1Id = profile1.id;
    worker2Id = profile2.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, app);
  }, 15_000);

  // ─── Helpers ──────────────────────────────────────────

  /** Build a UTC date for the next occurrence of a given weekday (Mon=1..Sat=6). */
  function nextWeekday(n: number = 1): Date {
    const d = new Date();
    let count = 0;
    while (count < n) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0) count++;
    }
    return d;
  }

  /** Create an ISO string for a given date at HH:MM UTC. */
  function atUTC(date: Date, hours: number, minutes: number = 0): string {
    const d = new Date(date);
    d.setUTCHours(hours, minutes, 0, 0);
    return d.toISOString();
  }

  function createOrder(overrides: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        branchId,
        clientId,
        vehicleId,
        serviceIds: [service30minId],
        ...overrides,
      });
  }

  // ═══════════════════════════════════════════════════════
  //  FLOW 1: Full order lifecycle
  //  Client → Vehicle → Services → Check availability →
  //  Create order → IN_PROGRESS → COMPLETED
  // ═══════════════════════════════════════════════════════

  describe('Flow 1: Full order creation & lifecycle', () => {
    const day = nextWeekday(2);
    let orderId: string;

    it('Step 1: check availability returns slots', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/availability')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({
          branchId,
          date: day.toISOString(),
          durationMinutes: 30,
        })
        .expect(200);

      const slots = res.body.data;
      expect(Array.isArray(slots)).toBe(true);
      expect(slots.length).toBeGreaterThan(0);

      // All slots for our two posts should exist
      const available = slots.filter((s: any) => s.available);
      expect(available.length).toBeGreaterThan(0);
    });

    it('Step 2: create order at 10:00 on work post 1', async () => {
      const res = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res.body.data).toMatchObject({
        status: 'BOOKED',
        source: 'INTERNAL',
      });
      expect(res.body.data.services).toHaveLength(1);
      expect(res.body.data.assignedEmployee).toBeTruthy(); // auto-assigned
      orderId = res.body.data.id;
    });

    it('Step 3: transition BOOKED → IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(res.body.data.status).toBe('IN_PROGRESS');
    });

    it('Step 4: transition IN_PROGRESS → COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('Step 5: completed order frees the slot — same slot bookable again', async () => {
      // Same work post, same time as the completed order → should succeed
      const res = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res.body.data.status).toBe('BOOKED');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 2: Time crossing / double-booking prevention
  //  Two orders on same post, overlapping times →
  //  second must be rejected.
  // ═══════════════════════════════════════════════════════

  describe('Flow 2: Time slot conflicts on same work post', () => {
    const day = nextWeekday(3);

    it('books 10:00–10:30, then exact same slot → 409', async () => {
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(409);
    });

    it('books 11:00–11:30, then overlapping 11:15 → 409 (buffer overlap)', async () => {
      // First order: 11:00–11:30 (+ 10min buffer = effective 10:50–11:40)
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 11),
      }).expect(201);

      // Second order starts at 11:15 → overlaps with 10:50–11:40
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 11, 15),
      }).expect(409);
    });

    it('books 12:00–12:30 on post 1, same time on post 2 → succeeds', async () => {
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      // Different work post — should NOT conflict
      const res = await createOrder({
        workPostId: workPost2Id,
        scheduledStart: atUTC(day, 12),
      }).expect(201);

      expect(res.body.data.workPostId).toBe(workPost2Id);
    });

    it('books 13:00 on post 1, then 13:45 on post 1 → succeeds (outside buffer)', async () => {
      // 30min service + 10min buffer = effective 12:50–13:40
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 13),
      }).expect(201);

      // 13:45 starts after 13:40 buffer end → should succeed
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 13, 45),
      }).expect(201);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 3: Worker-specific scheduling conflicts
  //  Two orders with the same assigned worker at the
  //  same time → second rejected (availability returns
  //  no slots for that worker).
  // ═══════════════════════════════════════════════════════

  describe('Flow 3: Worker-specific time conflicts', () => {
    const day = nextWeekday(4);

    it('worker1 on post1, worker2 on post2, same time → both succeed', async () => {
      const res1 = await createOrder({
        workPostId: workPost1Id,
        assignedEmployeeId: worker1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res1.body.data.assignedEmployeeId).toBe(worker1Id);

      const res2 = await createOrder({
        workPostId: workPost2Id,
        assignedEmployeeId: worker2Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res2.body.data.assignedEmployeeId).toBe(worker2Id);
    });

    it('auto-assign skips busy worker and picks the free one', async () => {
      // Worker1 is already booked at 10:00 from prev test.
      // Auto-assign at 10:00 on post1 should pick worker2...
      // but post1 is already occupied → use a new time slot.
      const res = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      const assignedId = res.body.data.assignedEmployeeId;
      expect(assignedId).toBeTruthy();

      // Second auto-assign at the same 14:00 on post2 → picks the other worker
      const res2 = await createOrder({
        workPostId: workPost2Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      expect(res2.body.data.assignedEmployeeId).not.toBe(assignedId);
    });

    it('availability API filters by assignedEmployeeId', async () => {
      // Worker1 is booked at 10:00 on this day
      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/availability')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({
          branchId,
          date: day.toISOString(),
          durationMinutes: 30,
          assignedEmployeeId: worker1Id,
        })
        .expect(200);

      const slots = res.body.data as Array<{
        start: string;
        available: boolean;
      }>;
      // The 10:00 slots should NOT be available for worker1
      const tenAmSlots = slots.filter((s) => {
        const h = new Date(s.start).getUTCHours();
        return h === 10;
      });
      const availableTenAm = tenAmSlots.filter((s) => s.available);
      expect(availableTenAm).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 4: Auto-assign work post inside transaction
  //  When workPostId is omitted, the system picks the
  //  first free post. Fill post1, then next goes to post2.
  // ═══════════════════════════════════════════════════════

  describe('Flow 4: Auto-assign work post', () => {
    const day = nextWeekday(5);

    it('auto-assigns first available post, then fallback to second', async () => {
      // Order 1: no workPostId → gets auto-assigned
      const res1 = await createOrder({
        scheduledStart: atUTC(day, 9),
      }).expect(201);

      const post1 = res1.body.data.workPostId;
      expect(post1).toBeTruthy();

      // Order 2: same time, no workPostId → should get the other post
      const res2 = await createOrder({
        scheduledStart: atUTC(day, 9),
      }).expect(201);

      const post2 = res2.body.data.workPostId;
      expect(post2).toBeTruthy();
      expect(post2).not.toBe(post1);
    });

    it('both posts full at same time → 400', async () => {
      // Both posts now occupied at 09:00 — third should fail
      await createOrder({
        scheduledStart: atUTC(day, 9),
      }).expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 5: Order cancel frees the slot
  //  Book → Cancel → Re-book same slot
  // ═══════════════════════════════════════════════════════

  describe('Flow 5: Cancel frees the slot', () => {
    const day = nextWeekday(6);
    let orderId: string;

    it('book 10:00 post1 → cancel → re-book succeeds', async () => {
      // Book
      const res1 = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);
      orderId = res1.body.data.id;

      // Cancel
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          status: 'CANCELLED',
          cancellationReason: 'Client changed mind',
        })
        .expect(200);

      // Re-book same slot
      const res2 = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      expect(res2.body.data.status).toBe('BOOKED');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 6: Soft-delete and restore with conflict check
  //  Delete order → Book same slot → Restore → 409
  // ═══════════════════════════════════════════════════════

  describe('Flow 6: Restore blocked by scheduling conflict', () => {
    const day = nextWeekday(7);
    let deletedOrderId: string;

    it('delete order, book same slot, then restore fails with 409', async () => {
      // Step 1: Book an order
      const res1 = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);
      deletedOrderId = res1.body.data.id;

      // Step 2: Soft-delete it
      await request(app.getHttpServer())
        .delete(`/api/v1/orders/${deletedOrderId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Step 3: Book another order in the same slot
      await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 14),
      }).expect(201);

      // Step 4: Try to restore the deleted order → conflict
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${deletedOrderId}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(409);
    });

    it('restore succeeds when slot is free', async () => {
      // Create and delete an order on a free slot
      const day2 = nextWeekday(8);
      const res = await createOrder({
        workPostId: workPost2Id,
        scheduledStart: atUTC(day2, 16),
      }).expect(201);

      await request(app.getHttpServer())
        .delete(`/api/v1/orders/${res.body.data.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Restore — slot is free
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${res.body.data.id}/restore`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 7: Business rules — working days & advance limit
  // ═══════════════════════════════════════════════════════

  describe('Flow 7: Business rules enforcement', () => {
    it('rejects booking on Sunday (non-working day)', async () => {
      // Find the next Sunday
      const sunday = new Date();
      while (sunday.getUTCDay() !== 0) {
        sunday.setUTCDate(sunday.getUTCDate() + 1);
      }

      const res = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(sunday, 10),
      });

      // Should be rejected — Sunday not in default workingDays [1,2,3,4,5,6]
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not allowed on this day/i);
    });

    it('rejects booking beyond maxAdvanceBookingDays (default 30)', async () => {
      const farFuture = new Date();
      farFuture.setUTCDate(farFuture.getUTCDate() + 60);
      // Skip Sunday
      while (farFuture.getUTCDay() === 0) {
        farFuture.setUTCDate(farFuture.getUTCDate() + 1);
      }

      const res = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(farFuture, 10),
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/cannot book more than/i);
    });

    it('availability returns [] for Sunday', async () => {
      const sunday = new Date();
      while (sunday.getUTCDay() !== 0) {
        sunday.setUTCDate(sunday.getUTCDate() + 1);
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/availability')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({
          branchId,
          date: sunday.toISOString(),
          durationMinutes: 30,
        })
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });

    it('availability returns [] for date beyond max advance', async () => {
      const farFuture = new Date();
      farFuture.setUTCDate(farFuture.getUTCDate() + 60);

      const res = await request(app.getHttpServer())
        .get('/api/v1/orders/availability')
        .set('Authorization', `Bearer ${accessToken}`)
        .query({
          branchId,
          date: farFuture.toISOString(),
          durationMinutes: 30,
        })
        .expect(200);

      expect(res.body.data).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 8: Invalid status transitions
  //  Verifies the state machine rejects illegal moves.
  // ═══════════════════════════════════════════════════════

  describe('Flow 8: Status transition enforcement', () => {
    const day = nextWeekday(9);
    let orderId: string;

    beforeAll(async () => {
      const res = await createOrder({
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 15),
      });
      orderId = res.body.data.id;
    });

    it('BOOKED → COMPLETED is invalid (must go through IN_PROGRESS)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'COMPLETED' })
        .expect(400);
    });

    it('BOOKED → IN_PROGRESS → BOOKED is invalid (no going back)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'BOOKED' })
        .expect(400);
    });

    it('COMPLETED is terminal — no further transitions', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'COMPLETED' })
        .expect(200);

      // Try to go back
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${orderId}/status`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 9: Longer services take more time → overlap
  //  A 60-min service occupies 10:00–11:00, blocking
  //  a 30-min service at 10:30.
  // ═══════════════════════════════════════════════════════

  describe('Flow 9: Multi-duration service overlap', () => {
    const day = nextWeekday(10);

    it('60-min service at 10:00 blocks 30-min service at 10:30 on same post', async () => {
      // Book 60-min service at 10:00 → occupies 10:00–11:00 (+buffer = 9:50–11:10)
      await createOrder({
        workPostId: workPost1Id,
        serviceIds: [service60minId],
        scheduledStart: atUTC(day, 10),
      }).expect(201);

      // 30-min at 10:30 on same post → conflicts
      await createOrder({
        workPostId: workPost1Id,
        serviceIds: [service30minId],
        scheduledStart: atUTC(day, 10, 30),
      }).expect(409);
    });

    it('60-min at 10:00 post1, 30-min at 10:30 post2 → succeeds (different post)', async () => {
      const res = await createOrder({
        workPostId: workPost2Id,
        serviceIds: [service30minId],
        scheduledStart: atUTC(day, 10, 30),
      }).expect(201);

      expect(res.body.data.workPostId).toBe(workPost2Id);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 10: Public booking flow
  //  Guest checks availability → books → same slot
  //  conflict handled with friendly error.
  // ═══════════════════════════════════════════════════════

  describe('Flow 10: Public booking full flow', () => {
    const day = nextWeekday(11);

    it('public availability → book → double-book fails', async () => {
      // Step 1: Check availability (public)
      const availRes = await request(app.getHttpServer())
        .get(`/api/v1/public/booking/${SLUG}/availability`)
        .query({
          branchId,
          date: day.toISOString(),
          durationMinutes: 30,
        })
        .expect(200);

      const available = availRes.body.data.filter((s: any) => s.available);
      expect(available.length).toBeGreaterThan(0);

      // Step 2: Create booking (public)
      const bookRes = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          workPostId: workPost1Id,
          scheduledStart: atUTC(day, 10),
          serviceIds: [service30minId],
          firstName: 'Olena',
          lastName: 'Kovalenko',
          phone: '+380501234567',
          licensePlate: 'BB5678CC',
        })
        .expect(201);

      expect(bookRes.body.data.status).toBe('BOOKED_PENDING_CONFIRMATION');
      expect(bookRes.body.data.source).toBe('WEB');

      // Step 3: Same slot again → conflict (409, not raw 400)
      const conflictRes = await request(app.getHttpServer())
        .post(`/api/v1/public/booking/${SLUG}/book`)
        .send({
          branchId,
          workPostId: workPost1Id,
          scheduledStart: atUTC(day, 10),
          serviceIds: [service30minId],
          firstName: 'Andriy',
          lastName: 'Bondarenko',
          phone: '+380509876543',
          licensePlate: 'CC9999DD',
        });

      expect(conflictRes.status).toBe(409);
    });

    it('public services and branches endpoints work', async () => {
      const servicesRes = await request(app.getHttpServer())
        .get(`/api/v1/public/booking/${SLUG}/services`)
        .expect(200);

      expect(Array.isArray(servicesRes.body.data)).toBe(true);

      const branchesRes = await request(app.getHttpServer())
        .get(`/api/v1/public/booking/${SLUG}/branches`)
        .expect(200);

      expect(Array.isArray(branchesRes.body.data)).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 11: Workforce capacity cap
  //  With 2 workers and 2 posts, only 2 concurrent
  //  orders possible (capped by workforce, not posts).
  //  Third order → fails.
  // ═══════════════════════════════════════════════════════

  describe('Flow 11: Workforce capacity limits concurrent orders', () => {
    const day = nextWeekday(15);

    it('2 workers + 2 posts = max 2 concurrent orders, third fails', async () => {
      const res1 = await createOrder({
        scheduledStart: atUTC(day, 11),
      }).expect(201);

      const res2 = await createOrder({
        scheduledStart: atUTC(day, 11),
      }).expect(201);

      // Verify they got different workers
      const emp1 = res1.body.data.assignedEmployeeId;
      const emp2 = res2.body.data.assignedEmployeeId;
      expect(emp1).not.toBe(emp2);

      // Order 3: no workers left → 400
      await createOrder({
        scheduledStart: atUTC(day, 11),
      }).expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  FLOW 12: Idempotency — duplicate requests
  //  Same idempotency key → same response, no duplicate.
  // ═══════════════════════════════════════════════════════

  describe('Flow 12: Idempotent order creation', () => {
    const day = nextWeekday(13);
    const idempotencyKey = 'unique-key-' + Date.now();

    it('same idempotency key returns same order, not a duplicate', async () => {
      const payload = {
        branchId,
        clientId,
        vehicleId,
        workPostId: workPost1Id,
        scheduledStart: atUTC(day, 10),
        serviceIds: [service30minId],
      };

      const res1 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('idempotency-key', idempotencyKey)
        .send(payload)
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('idempotency-key', idempotencyKey)
        .send(payload)
        .expect(201);

      // Same order returned
      expect(res2.body.data.id).toBe(res1.body.data.id);
    });
  });
});
