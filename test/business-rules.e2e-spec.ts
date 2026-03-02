import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { CleanupService } from '../src/modules/cleanup/cleanup.service';
import {
  createTestApp,
  deleteTenantData,
  nextWorkday,
} from './helpers/test-app';

/**
 * Business rules E2E tests: status transitions, public booking,
 * audit logs, analytics, services CRUD, cleanup, idempotency.
 */
describe('Business Rules (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenant: { id: string };
  let branch: { id: string };
  let token: string;
  let slug: string;

  // Shared entities
  let svc30Id: string; // 30min/$50
  let svc60Id: string; // 60min/$100
  let clientId: string;
  let vehicleId: string;
  let wp1Id: string;
  let wp2Id: string;

  // Second branch with allowOnlineBooking=false
  let branchClosedId: string;
  let wpClosedId: string;

  const api = () => {
    const server = app.getHttpServer() as App;
    return {
      get: (url: string) =>
        request(server).get(url).set('Authorization', `Bearer ${token}`),
      post: (url: string) =>
        request(server).post(url).set('Authorization', `Bearer ${token}`),
      patch: (url: string) =>
        request(server).patch(url).set('Authorization', `Bearer ${token}`),
      delete: (url: string) =>
        request(server).delete(url).set('Authorization', `Bearer ${token}`),
    };
  };

  const publicApi = () => {
    const server = app.getHttpServer() as App;
    return {
      get: (url: string) => request(server).get(url),
      post: (url: string) => request(server).post(url),
    };
  };

  /** Creates an order via Prisma with a unique time slot */
  async function createOrderDirect(
    overrides: {
      branchId?: string;
      workPostId?: string;
      status?: string;
      minuteOffset?: number;
      dayOffset?: number;
      serviceId?: string;
    } = {},
  ) {
    const day = overrides.dayOffset ?? 8;
    const offset = overrides.minuteOffset ?? 0;
    const start = nextWorkday(10, day);
    start.setUTCMinutes(start.getUTCMinutes() + offset);
    const end = new Date(start.getTime() + 30 * 60 * 1000);

    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        branchId: overrides.branchId ?? branch.id,
        clientId,
        vehicleId,
        workPostId: overrides.workPostId ?? wp1Id,
        scheduledStart: start,
        scheduledEnd: end,
        totalPrice: 50,
        status: (overrides.status as any) ?? 'BOOKED',
      },
    });
    await prisma.orderService.create({
      data: {
        tenantId: tenant.id,
        orderId: order.id,
        serviceId: overrides.serviceId ?? svc30Id,
        price: 50,
      },
    });
    return order;
  }

  beforeAll(async () => {
    slug = 'e2e-business';
    const setup = await createTestApp(slug);
    app = setup.app;
    prisma = setup.prisma;
    tenant = setup.testTenant;
    branch = setup.testBranch;
    token = setup.accessToken;

    // Services
    const s30 = await prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: 'Quick Wash',
        durationMin: 30,
        price: 50,
      },
    });
    svc30Id = s30.id;

    const s60 = await prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: 'Full Detail',
        durationMin: 60,
        price: 100,
      },
    });
    svc60Id = s60.id;

    // Work posts
    const w1 = await prisma.workPost.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: 'WP Biz 1' },
    });
    wp1Id = w1.id;

    const w2 = await prisma.workPost.create({
      data: { tenantId: tenant.id, branchId: branch.id, name: 'WP Biz 2' },
    });
    wp2Id = w2.id;

    // Client + vehicle
    const c = await prisma.client.create({
      data: {
        tenantId: tenant.id,
        firstName: 'Biz',
        lastName: 'Client',
        phone: '+380990001111',
      },
    });
    clientId = c.id;

    const v = await prisma.vehicle.create({
      data: {
        tenantId: tenant.id,
        clientId: c.id,
        licensePlate: 'BIZ-001',
        make: 'Toyota',
      },
    });
    vehicleId = v.id;

    // Employees (wide schedule to avoid scheduling conflicts)
    const hash = await argon2.hash('password123');
    for (const [i, name] of ['Worker1', 'Worker2'].entries()) {
      const workerUser = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: `${name.toLowerCase()}@biz.com`,
          passwordHash: hash,
          firstName: name,
          lastName: 'Biz',
        },
      });
      await prisma.employeeProfile.create({
        data: {
          tenantId: tenant.id,
          userId: workerUser.id,
          branchId: branch.id,
          isWorker: true,
          active: true,
          workStartTime: '06:00',
          workEndTime: '22:00',
        },
      });
    }

    // Booking settings: allow online booking
    await prisma.bookingSettings.updateMany({
      where: { tenantId: tenant.id, branchId: null },
      data: {
        allowOnlineBooking: true,
        workingHoursStart: '06:00',
        workingHoursEnd: '22:00',
        workingDays: [1, 2, 3, 4, 5, 6],
      },
    });

    // Closed branch (no online booking)
    const bClosed = await prisma.branch.create({
      data: { tenantId: tenant.id, name: 'Closed Branch' },
    });
    branchClosedId = bClosed.id;

    const wpClosed = await prisma.workPost.create({
      data: { tenantId: tenant.id, branchId: bClosed.id, name: 'WP Closed' },
    });
    wpClosedId = wpClosed.id;

    const closedWorkerUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'closed-worker@biz.com',
        passwordHash: hash,
        firstName: 'ClosedEmp',
        lastName: 'Biz',
      },
    });
    await prisma.employeeProfile.create({
      data: {
        tenantId: tenant.id,
        userId: closedWorkerUser.id,
        branchId: bClosed.id,
        isWorker: true,
        active: true,
        workStartTime: '06:00',
        workEndTime: '22:00',
      },
    });
  }, 120_000);

  afterAll(async () => {
    await deleteTenantData(prisma, tenant.id);
    await app.close();
  }, 30_000);

  // ====================================================================
  // SECTION 1: Order Status Transitions
  // ====================================================================
  describe('Order Status Transitions', () => {
    // --- BOOKED → valid transitions ---
    it('BOOKED → IN_PROGRESS', async () => {
      const order = await createOrderDirect({ minuteOffset: 0, dayOffset: 9 });
      const res = await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
    });

    it('BOOKED → CANCELLED (with reason)', async () => {
      const order = await createOrderDirect({ minuteOffset: 60, dayOffset: 9 });
      const res = await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'CANCELLED', cancellationReason: 'Customer no-show' })
        .expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('BOOKED → NO_SHOW, then rebook same slot', async () => {
      const order = await createOrderDirect({
        minuteOffset: 120,
        dayOffset: 9,
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'NO_SHOW' })
        .expect(200);

      // Same work post + time slot should be free now
      const start = new Date(order.scheduledStart);
      const rebookRes = await api()
        .post('/api/v1/orders')
        .send({
          branchId: branch.id,
          clientId,
          vehicleId,
          workPostId: wp1Id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
        })
        .expect(201);
      expect(rebookRes.body.data.status).toBe('BOOKED');
    });

    // --- BOOKED → invalid transitions ---
    it('BOOKED → COMPLETED → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 180,
        dayOffset: 9,
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'COMPLETED' })
        .expect(400);
    });

    it('BOOKED → BOOKED_PENDING_CONFIRMATION → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 240,
        dayOffset: 9,
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'BOOKED_PENDING_CONFIRMATION' })
        .expect(400);
    });

    // --- IN_PROGRESS → valid transitions ---
    it('IN_PROGRESS → COMPLETED', async () => {
      const order = await createOrderDirect({ minuteOffset: 0, dayOffset: 10 });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'IN_PROGRESS' },
      });
      const res = await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'COMPLETED' })
        .expect(200);
      expect(res.body.data.status).toBe('COMPLETED');
    });

    it('IN_PROGRESS → CANCELLED', async () => {
      const order = await createOrderDirect({
        minuteOffset: 60,
        dayOffset: 10,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'IN_PROGRESS' },
      });
      const res = await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'CANCELLED', cancellationReason: 'Issue found' })
        .expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    // --- IN_PROGRESS → invalid transitions ---
    it('IN_PROGRESS → BOOKED → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 120,
        dayOffset: 10,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'IN_PROGRESS' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'BOOKED' })
        .expect(400);
    });

    it('IN_PROGRESS → NO_SHOW → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 180,
        dayOffset: 10,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'IN_PROGRESS' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'NO_SHOW' })
        .expect(400);
    });

    // --- Terminal states reject everything ---
    it('COMPLETED → BOOKED → 400', async () => {
      const order = await createOrderDirect({ minuteOffset: 0, dayOffset: 11 });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'BOOKED' })
        .expect(400);
    });

    it('COMPLETED → IN_PROGRESS → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 60,
        dayOffset: 11,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'COMPLETED' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
    });

    it('CANCELLED → BOOKED → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 120,
        dayOffset: 11,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'BOOKED' })
        .expect(400);
    });

    it('CANCELLED → IN_PROGRESS → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 180,
        dayOffset: 11,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
    });

    it('NO_SHOW → BOOKED → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 240,
        dayOffset: 11,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'NO_SHOW' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'BOOKED' })
        .expect(400);
    });

    it('NO_SHOW → IN_PROGRESS → 400', async () => {
      const order = await createOrderDirect({
        minuteOffset: 300,
        dayOffset: 11,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'NO_SHOW' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
    });

    // --- BOOKED_PENDING_CONFIRMATION flow ---
    it('BOOKED_PENDING_CONFIRMATION → BOOKED (confirm)', async () => {
      const order = await createOrderDirect({ minuteOffset: 0, dayOffset: 12 });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'BOOKED_PENDING_CONFIRMATION' },
      });
      const res = await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'BOOKED' })
        .expect(200);
      expect(res.body.data.status).toBe('BOOKED');
    });

    it('BOOKED_PENDING_CONFIRMATION → IN_PROGRESS → 400 (must confirm first)', async () => {
      const order = await createOrderDirect({
        minuteOffset: 60,
        dayOffset: 12,
      });
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'BOOKED_PENDING_CONFIRMATION' },
      });
      await api()
        .patch(`/api/v1/orders/${order.id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(400);
    });
  });

  // ====================================================================
  // SECTION 2: Public Booking Edge Cases
  // ====================================================================
  describe('Public Booking Edge Cases', () => {
    it('allowOnlineBooking=false → 403', async () => {
      // branchClosed has no booking-settings override, but the tenant-level
      // allowOnlineBooking=true. We need to test a tenant with it disabled.
      // Temporarily disable it:
      await prisma.bookingSettings.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { allowOnlineBooking: false },
      });

      const start = nextWorkday(10, 13);
      await publicApi()
        .post(`/api/v1/public/booking/${slug}/book`)
        .send({
          branchId: branch.id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
          firstName: 'Test',
          lastName: 'Disabled',
          phone: '+380990009999',
          licensePlate: 'DIS-001',
        })
        .expect(403);

      // Restore
      await prisma.bookingSettings.updateMany({
        where: { tenantId: tenant.id, branchId: null },
        data: { allowOnlineBooking: true },
      });
    });

    it('Existing phone reuses client (no dup)', async () => {
      const countBefore = await prisma.client.count({
        where: { tenantId: tenant.id, phone: '+380990001111' },
      });

      const start = nextWorkday(10, 14);
      await publicApi()
        .post(`/api/v1/public/booking/${slug}/book`)
        .send({
          branchId: branch.id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
          firstName: 'Biz',
          lastName: 'Client',
          phone: '+380990001111',
          licensePlate: 'BIZ-001',
        })
        .expect(201);

      const countAfter = await prisma.client.count({
        where: { tenantId: tenant.id, phone: '+380990001111' },
      });
      expect(countAfter).toBe(countBefore);
    });

    it('New phone creates new client', async () => {
      const countBefore = await prisma.client.count({
        where: { tenantId: tenant.id },
      });

      const start = nextWorkday(11, 14);
      await publicApi()
        .post(`/api/v1/public/booking/${slug}/book`)
        .send({
          branchId: branch.id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
          firstName: 'NewPub',
          lastName: 'Client',
          phone: '+380990008888',
          licensePlate: 'NEW-PUB-001',
        })
        .expect(201);

      const countAfter = await prisma.client.count({
        where: { tenantId: tenant.id },
      });
      expect(countAfter).toBe(countBefore + 1);
    });

    it('Existing licensePlate+client reuses vehicle', async () => {
      const countBefore = await prisma.vehicle.count({
        where: { tenantId: tenant.id, licensePlate: 'BIZ-001' },
      });

      const start = nextWorkday(12, 14);
      await publicApi()
        .post(`/api/v1/public/booking/${slug}/book`)
        .send({
          branchId: branch.id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
          firstName: 'Biz',
          lastName: 'Client',
          phone: '+380990001111',
          licensePlate: 'BIZ-001',
        })
        .expect(201);

      const countAfter = await prisma.vehicle.count({
        where: { tenantId: tenant.id, licensePlate: 'BIZ-001' },
      });
      expect(countAfter).toBe(countBefore);
    });

    it('New licensePlate creates vehicle', async () => {
      const countBefore = await prisma.vehicle.count({
        where: { tenantId: tenant.id },
      });

      const start = nextWorkday(13, 14);
      await publicApi()
        .post(`/api/v1/public/booking/${slug}/book`)
        .send({
          branchId: branch.id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
          firstName: 'Biz',
          lastName: 'Client',
          phone: '+380990001111',
          licensePlate: 'BRAND-NEW-001',
        })
        .expect(201);

      const countAfter = await prisma.vehicle.count({
        where: { tenantId: tenant.id },
      });
      expect(countAfter).toBe(countBefore + 1);
    });

    it('Non-existent tenant slug → 404', async () => {
      const start = nextWorkday(10, 15);
      await publicApi()
        .post('/api/v1/public/booking/non-existent-slug-xyz/book')
        .send({
          branchId: branch.id,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
          firstName: 'X',
          lastName: 'Y',
          phone: '+380990007777',
          licensePlate: 'XXX-001',
        })
        .expect(404);
    });
  });

  // ====================================================================
  // SECTION 3: Audit Log Integration
  // ====================================================================
  describe('Audit Log Integration', () => {
    let auditOrderId: string;

    beforeAll(async () => {
      // Create an order via API (should generate audit entry)
      const start = nextWorkday(10, 16);
      const res = await api()
        .post('/api/v1/orders')
        .send({
          branchId: branch.id,
          clientId,
          vehicleId,
          scheduledStart: start.toISOString(),
          serviceIds: [svc30Id],
        })
        .expect(201);
      auditOrderId = res.body.data.id;
    });

    it('ORDER_CREATED audit entry exists', async () => {
      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: auditOrderId,
          action: 'CREATE',
        },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].entityType).toBe('Order');
    });

    it('ORDER_STATUS_CHANGED entry on IN_PROGRESS', async () => {
      await api()
        .patch(`/api/v1/orders/${auditOrderId}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      // Event handlers are async (fire-and-forget) — allow time to complete
      await new Promise((r) => setTimeout(r, 200));

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: auditOrderId,
          action: 'STATUS_CHANGE',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      const latest = logs[0];
      const oldVal = latest.oldValue as any;
      const newVal = latest.newValue as any;
      expect(oldVal?.status).toBe('BOOKED');
      expect(newVal?.status).toBe('IN_PROGRESS');
    });

    it('ORDER_CANCELLED entry has reason', async () => {
      await api()
        .patch(`/api/v1/orders/${auditOrderId}/status`)
        .send({ status: 'CANCELLED', cancellationReason: 'Audit test reason' })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));

      const logs = await prisma.auditLog.findMany({
        where: {
          tenantId: tenant.id,
          entityId: auditOrderId,
          action: 'STATUS_CHANGE',
        },
        orderBy: { createdAt: 'desc' },
      });
      const cancelLog = logs.find(
        (l) =>
          (l.newValue as any)?.status === 'CANCELLED' &&
          (l.newValue as any)?.reason != null,
      );
      expect(cancelLog).toBeDefined();
      expect((cancelLog!.newValue as any).reason).toBe('Audit test reason');
    });

    it('CLIENT_DELETED audit entry', async () => {
      // Create a throw-away client, then delete
      const c = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          firstName: 'AuditDel',
          lastName: 'Client',
          phone: '+380990006666',
        },
      });

      await api().delete(`/api/v1/clients/${c.id}`).expect(200);

      await new Promise((r) => setTimeout(r, 200));

      const logs = await prisma.auditLog.findMany({
        where: { tenantId: tenant.id, entityId: c.id, action: 'DELETE' },
      });
      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].entityType).toBe('Client');
    });

    it('Multiple transitions → multiple audit entries', async () => {
      const allLogs = await prisma.auditLog.findMany({
        where: { tenantId: tenant.id, entityId: auditOrderId },
      });
      // CREATE + IN_PROGRESS transition + CANCELLED transition = at least 3
      expect(allLogs.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ====================================================================
  // SECTION 4: Analytics Correctness
  // ====================================================================
  describe('Analytics Correctness', () => {
    beforeAll(async () => {
      // Create 5 orders for today with specific statuses via Prisma
      const now = new Date();
      const todayBase = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          8,
          0,
          0,
        ),
      );

      const statuses = [
        'COMPLETED',
        'COMPLETED',
        'COMPLETED',
        'CANCELLED',
        'IN_PROGRESS',
      ];
      const prices = [50, 50, 50, 50, 100];

      for (let i = 0; i < statuses.length; i++) {
        const start = new Date(todayBase.getTime() + i * 45 * 60 * 1000);
        const end = new Date(start.getTime() + 30 * 60 * 1000);
        const order = await prisma.order.create({
          data: {
            tenantId: tenant.id,
            branchId: branch.id,
            clientId,
            vehicleId,
            workPostId: i % 2 === 0 ? wp1Id : wp2Id,
            scheduledStart: start,
            scheduledEnd: end,
            totalPrice: prices[i],
            status: statuses[i] as any,
          },
        });
        await prisma.orderService.create({
          data: {
            tenantId: tenant.id,
            orderId: order.id,
            serviceId: i === 4 ? svc60Id : svc30Id,
            price: prices[i],
          },
        });
      }
    });

    it('Dashboard totalOrders (non-cancelled) >= 4', async () => {
      const res = await api().get('/api/v1/analytics/dashboard').expect(200);
      expect(res.body.data.totalOrders).toBeGreaterThanOrEqual(4);
    });

    it('Dashboard totalRevenue (COMPLETED + IN_PROGRESS) >= 250', async () => {
      const res = await api().get('/api/v1/analytics/dashboard').expect(200);
      const revenue = parseFloat(res.body.data.totalRevenue);
      expect(revenue).toBeGreaterThanOrEqual(250);
    });

    it('Dashboard completionRate is a number 0-100', async () => {
      const res = await api().get('/api/v1/analytics/dashboard').expect(200);
      const rate = parseFloat(res.body.data.completionRate);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(100);
    });

    it('KPI ordersToday >= 5', async () => {
      const res = await api().get('/api/v1/analytics/kpi').expect(200);
      expect(res.body.data.ordersToday).toBeGreaterThanOrEqual(5);
    });

    it('KPI cancelRateToday > 0', async () => {
      const res = await api().get('/api/v1/analytics/kpi').expect(200);
      const rate = parseFloat(res.body.data.cancelRateToday);
      expect(rate).toBeGreaterThan(0);
    });

    it('Alerts returns well-formed objects', async () => {
      const res = await api().get('/api/v1/analytics/alerts').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      for (const alert of res.body.data) {
        expect(alert).toHaveProperty('type');
        expect(alert).toHaveProperty('severity');
      }
    });
  });

  // ====================================================================
  // SECTION 5: Services CRUD
  // ====================================================================
  describe('Services CRUD', () => {
    let newServiceId: string;

    it('POST /services creates', async () => {
      const res = await api()
        .post('/api/v1/services')
        .send({ name: 'Interior Clean', durationMin: 45, price: 75 })
        .expect(201);
      expect(res.body.data.name).toBe('Interior Clean');
      newServiceId = res.body.data.id;
    });

    it('GET /services lists it', async () => {
      const res = await api().get('/api/v1/services').expect(200);
      const ids: string[] = res.body.data.map((s: { id: string }) => s.id);
      expect(ids).toContain(newServiceId);
    });

    it('GET /services/:id returns it', async () => {
      const res = await api()
        .get(`/api/v1/services/${newServiceId}`)
        .expect(200);
      expect(res.body.data.name).toBe('Interior Clean');
      expect(res.body.data.durationMin).toBe(45);
    });

    it('PATCH /services/:id updates', async () => {
      const res = await api()
        .patch(`/api/v1/services/${newServiceId}`)
        .send({ name: 'Interior Clean Pro', price: 85 })
        .expect(200);
      expect(res.body.data.name).toBe('Interior Clean Pro');
    });

    it('DELETE soft-deletes → GET returns 404', async () => {
      await api().delete(`/api/v1/services/${newServiceId}`).expect(200);
      await api().get(`/api/v1/services/${newServiceId}`).expect(404);
    });

    it('PATCH /services/:id/restore restores', async () => {
      await api().patch(`/api/v1/services/${newServiceId}/restore`).expect(200);
      await api().get(`/api/v1/services/${newServiceId}`).expect(200);
    });

    it('Restore non-deleted → 400', async () => {
      await api().patch(`/api/v1/services/${newServiceId}/restore`).expect(400);
    });

    it('POST with invalid data → 400', async () => {
      await api()
        .post('/api/v1/services')
        .send({ name: '' }) // missing durationMin + price
        .expect(400);
    });

    it('GET non-existent → 404', async () => {
      await api()
        .get('/api/v1/services/00000000-0000-0000-0000-000000000099')
        .expect(404);
    });
  });

  // ====================================================================
  // SECTION 6: Cleanup Service
  // ====================================================================
  describe('Cleanup Service', () => {
    let oldClientId: string;
    let recentClientId: string;

    beforeAll(async () => {
      const cutoff31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
      const cutoff5 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

      // Old soft-deleted client (should be hard-deleted)
      const oldC = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Old',
          lastName: 'Cleanup',
          phone: '+380990005555',
          deletedAt: cutoff31,
        },
      });
      oldClientId = oldC.id;

      // Recent soft-deleted client (should be preserved)
      const recentC = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          firstName: 'Recent',
          lastName: 'Cleanup',
          phone: '+380990005556',
          deletedAt: cutoff5,
        },
      });
      recentClientId = recentC.id;
    });

    it('Hard-deletes records > 30 days old', async () => {
      const cleanupService = app.get(CleanupService);
      await cleanupService.handleHardDeleteCleanup();

      const found = await prisma.client.findUnique({
        where: { id: oldClientId },
      });
      expect(found).toBeNull();
    });

    it('Preserves records < 30 days old', async () => {
      const found = await prisma.client.findUnique({
        where: { id: recentClientId },
      });
      expect(found).not.toBeNull();
    });

    it('FK chain (order→client) cleaned without error', async () => {
      const cutoff31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      // Create client → vehicle → order chain, all soft-deleted >30 days
      const c = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          firstName: 'FKChain',
          lastName: 'Del',
          phone: '+380990005557',
          deletedAt: cutoff31,
        },
      });
      const v = await prisma.vehicle.create({
        data: {
          tenantId: tenant.id,
          clientId: c.id,
          licensePlate: 'FK-DEL-001',
          make: 'Ford',
          deletedAt: cutoff31,
        },
      });
      const start = new Date(cutoff31.getTime() - 1000);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      const o = await prisma.order.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          clientId: c.id,
          vehicleId: v.id,
          workPostId: wp1Id,
          scheduledStart: start,
          scheduledEnd: end,
          totalPrice: 50,
          status: 'CANCELLED',
          deletedAt: cutoff31,
        },
      });
      await prisma.orderService.create({
        data: {
          tenantId: tenant.id,
          orderId: o.id,
          serviceId: svc30Id,
          price: 50,
        },
      });

      const cleanupService = app.get(CleanupService);
      // Should not throw FK violation
      await expect(
        cleanupService.handleHardDeleteCleanup(),
      ).resolves.not.toThrow();

      const foundOrder = await prisma.order.findUnique({ where: { id: o.id } });
      expect(foundOrder).toBeNull();
    });
  });

  // ====================================================================
  // SECTION 7: Idempotency on Payments
  // ====================================================================
  describe('Idempotency on Payments', () => {
    let paymentOrderId: string;

    beforeAll(async () => {
      const order = await createOrderDirect({ minuteOffset: 0, dayOffset: 17 });
      paymentOrderId = order.id;
    });

    it('Same idempotency-key → cached response', async () => {
      const key = 'idem-test-same-key-001';
      const res1 = await api()
        .post(`/api/v1/orders/${paymentOrderId}/payments`)
        .set('idempotency-key', key)
        .send({ amount: 25, method: 'CASH' })
        .expect(201);

      // RxJS tap() doesn't await async callbacks — wait for idempotency save
      await new Promise((r) => setTimeout(r, 200));

      const res2 = await api()
        .post(`/api/v1/orders/${paymentOrderId}/payments`)
        .set('idempotency-key', key)
        .send({ amount: 25, method: 'CASH' });

      // Should return the same payment (cached)
      expect(res2.body.data.id).toBe(res1.body.data.id);

      const payments = await prisma.payment.findMany({
        where: { orderId: paymentOrderId },
      });
      const matchingPayments = payments.filter(
        (p) => p.id === res1.body.data.id,
      );
      expect(matchingPayments).toHaveLength(1);
    });

    it('Different keys → separate payments', async () => {
      const res1 = await api()
        .post(`/api/v1/orders/${paymentOrderId}/payments`)
        .set('idempotency-key', 'idem-key-diff-1')
        .send({ amount: 10, method: 'CASH' })
        .expect(201);

      const res2 = await api()
        .post(`/api/v1/orders/${paymentOrderId}/payments`)
        .set('idempotency-key', 'idem-key-diff-2')
        .send({ amount: 10, method: 'CASH' })
        .expect(201);

      expect(res1.body.data.id).not.toBe(res2.body.data.id);
    });

    it('No key → allows duplicates', async () => {
      const res1 = await api()
        .post(`/api/v1/orders/${paymentOrderId}/payments`)
        .send({ amount: 5, method: 'CASH' })
        .expect(201);

      const res2 = await api()
        .post(`/api/v1/orders/${paymentOrderId}/payments`)
        .send({ amount: 5, method: 'CASH' })
        .expect(201);

      expect(res1.body.data.id).not.toBe(res2.body.data.id);
    });
  });
});
