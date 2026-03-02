import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  deleteTenantData,
  createLimitedUser,
  loginAs,
  nextWorkday,
  TestSetup,
} from './helpers/test-app';

describe('Business Logic Gaps (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let tenantId: string;
  let branchId: string;

  // Shared entities
  let serviceActiveId: string; // 30min, $50
  let serviceActive2Id: string; // 60min, $100
  let clientId: string;
  let vehicleId: string;
  let workPostId: string;

  const api = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    (request(app.getHttpServer() as App) as any)
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${accessToken}`);

  beforeAll(async () => {
    const setup: TestSetup = await createTestApp('e2e-biz-gaps');
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    tenantId = setup.testTenant.id;
    branchId = setup.testBranch.id;

    // Services
    const svc1 = await prisma.service.create({
      data: { tenantId, name: 'Quick Wash', durationMin: 30, price: 50 },
    });
    serviceActiveId = svc1.id;

    const svc2 = await prisma.service.create({
      data: { tenantId, name: 'Full Detail', durationMin: 60, price: 100 },
    });
    serviceActive2Id = svc2.id;

    // Client + Vehicle
    const client = await prisma.client.create({
      data: {
        tenantId,
        firstName: 'Gap',
        lastName: 'Client',
        phone: '+380990005000',
      },
    });
    clientId = client.id;

    const vehicle = await prisma.vehicle.create({
      data: { tenantId, clientId, licensePlate: 'GAP-001', make: 'Toyota' },
    });
    vehicleId = vehicle.id;

    // Work post
    const wp = await prisma.workPost.create({
      data: { tenantId, branchId, name: 'Gap Post 1' },
    });
    workPostId = wp.id;

    // Employees for auto-assign
    const hash = await argon2.hash('password123');
    for (const name of ['GapWorker1', 'GapWorker2']) {
      const workerUser = await prisma.user.create({
        data: {
          tenantId,
          email: `${name.toLowerCase()}@e2e-biz-gaps.com`,
          passwordHash: hash,
          firstName: name,
          lastName: 'Test',
        },
      });
      await prisma.employeeProfile.create({
        data: {
          tenantId,
          userId: workerUser.id,
          branchId,
          isWorker: true,
          active: true,
          workStartTime: '06:00',
          workEndTime: '22:00',
        },
      });
    }

    // Booking settings
    await prisma.bookingSettings.updateMany({
      where: { tenantId, branchId: null },
      data: {
        allowOnlineBooking: true,
        workingHoursStart: '06:00',
        workingHoursEnd: '22:00',
        workingDays: [1, 2, 3, 4, 5, 6],
      },
    });
  }, 60_000);

  afterAll(async () => {
    await deleteTenantData(prisma, tenantId);
    await app.close();
  }, 30_000);

  // ---------------------------------------------------------------------------
  // Users - Reset Password
  // ---------------------------------------------------------------------------
  describe('Users - Reset Password', () => {
    let resetUserId: string;

    beforeAll(async () => {
      const res = await api('post', '/users')
        .send({
          email: 'resetpw@e2e-biz-gaps.com',
          password: 'oldPassword1',
          firstName: 'Reset',
          lastName: 'PW',
        })
        .expect(201);
      resetUserId = res.body.data.id;
    });

    it('PATCH /users/:id/reset-password resets password (204)', async () => {
      await api('patch', `/users/${resetUserId}/reset-password`)
        .send({ newPassword: 'newPassword99' })
        .expect(204);
    });

    it('old password no longer works after reset', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: 'resetpw@e2e-biz-gaps.com',
          password: 'oldPassword1',
        })
        .expect(401);
    });

    it('new password works after reset', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: 'resetpw@e2e-biz-gaps.com',
          password: 'newPassword99',
        })
        .expect(200);
    });

    it('rejects short password with 400', async () => {
      await api('patch', `/users/${resetUserId}/reset-password`)
        .send({ newPassword: 'short' })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Orders - Inactive/Deleted Service
  // ---------------------------------------------------------------------------
  describe('Orders - Inactive/Deleted Service', () => {
    let deletedServiceId: string;
    let inactiveServiceId: string;

    beforeAll(async () => {
      // Create a service, then soft-delete it
      const svcDeleted = await prisma.service.create({
        data: {
          tenantId,
          name: 'Deleted Svc',
          durationMin: 30,
          price: 30,
          isActive: true,
        },
      });
      deletedServiceId = svcDeleted.id;
      await prisma.service.update({
        where: { id: deletedServiceId },
        data: { deletedAt: new Date() },
      });

      // Create a service, then set isActive = false
      const svcInactive = await prisma.service.create({
        data: {
          tenantId,
          name: 'Inactive Svc',
          durationMin: 30,
          price: 30,
          isActive: false,
        },
      });
      inactiveServiceId = svcInactive.id;
    });

    it('order with soft-deleted service returns 400', async () => {
      const start = nextWorkday(10, 20);
      const res = await api('post', '/orders')
        .send({
          branchId,
          clientId,
          vehicleId,
          workPostId,
          scheduledStart: start.toISOString(),
          serviceIds: [deletedServiceId],
        })
        .expect(400);

      expect(res.body.message).toMatch(/not found or inactive/i);
    });

    it('order with isActive=false service returns 400', async () => {
      const start = nextWorkday(11, 20);
      const res = await api('post', '/orders')
        .send({
          branchId,
          clientId,
          vehicleId,
          workPostId,
          scheduledStart: start.toISOString(),
          serviceIds: [inactiveServiceId],
        })
        .expect(400);

      expect(res.body.message).toMatch(/not found or inactive/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Orders - Price/Duration Calculation
  // ---------------------------------------------------------------------------
  describe('Orders - Price/Duration Calculation', () => {
    it('totalPrice = sum(prices) and scheduledEnd = start + sum(durations)', async () => {
      const start = nextWorkday(10, 21);

      const res = await api('post', '/orders')
        .send({
          branchId,
          clientId,
          vehicleId,
          workPostId,
          scheduledStart: start.toISOString(),
          serviceIds: [serviceActiveId, serviceActive2Id], // 30min/$50 + 60min/$100
        })
        .expect(201);

      const order = res.body.data;

      // Price: 50 + 100 = 150 (Prisma Decimal may return string)
      expect(Number(order.totalPrice)).toBe(150);

      // Duration: 30 + 60 = 90 minutes
      const actualStart = new Date(order.scheduledStart).getTime();
      const actualEnd = new Date(order.scheduledEnd).getTime();
      const expectedDurationMs = 90 * 60 * 1000;
      expect(actualEnd - actualStart).toBe(expectedDurationMs);
    });
  });

  // ---------------------------------------------------------------------------
  // Clients - Merge Edge Cases
  // ---------------------------------------------------------------------------
  describe('Clients - Merge Edge Cases', () => {
    it('merge with non-existent sourceClientId returns 404', async () => {
      const fakeId = '00000000-0000-4000-8000-000000000099';
      await api('post', '/clients/merge')
        .send({
          sourceClientId: fakeId,
          targetClientId: clientId,
          fieldOverrides: { firstName: 'Merged' },
        })
        .expect(404);
    });

    it('merge with soft-deleted source client returns 404', async () => {
      // Create and soft-delete a client
      const tempRes = await api('post', '/clients')
        .send({ firstName: 'TempMerge', lastName: 'Source' })
        .expect(201);
      const tempClientId = tempRes.body.data.id;

      await api('delete', `/clients/${tempClientId}`).expect(200);

      await api('post', '/clients/merge')
        .send({
          sourceClientId: tempClientId,
          targetClientId: clientId,
          fieldOverrides: { firstName: 'ShouldFail' },
        })
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------------
  // Payments - Edge Cases
  // ---------------------------------------------------------------------------
  describe('Payments - Edge Cases', () => {
    let paymentOrderId: string;

    beforeAll(async () => {
      const start = nextWorkday(10, 22);
      const res = await api('post', '/orders')
        .send({
          branchId,
          clientId,
          vehicleId,
          workPostId,
          scheduledStart: start.toISOString(),
          serviceIds: [serviceActiveId],
        })
        .expect(201);
      paymentOrderId = res.body.data.id;
    });

    it('rejects payment with negative amount with 400', async () => {
      await api('post', `/orders/${paymentOrderId}/payments`)
        .send({ amount: -10, method: 'CASH' })
        .expect(400);
    });

    it('rejects payment with zero amount with 400', async () => {
      await api('post', `/orders/${paymentOrderId}/payments`)
        .send({ amount: 0, method: 'CASH' })
        .expect(400);
    });

    it('payment response includes status PAID', async () => {
      const res = await api('post', `/orders/${paymentOrderId}/payments`)
        .send({ amount: 25, method: 'CASH' })
        .expect(201);

      expect(res.body.data.status).toBe('PAID');
    });
  });

  // ---------------------------------------------------------------------------
  // Workforce - Validation
  // ---------------------------------------------------------------------------
  describe('Workforce - Validation', () => {
    let wfUserId1: string;
    let wfUserId2: string;
    let wfUserId3: string;

    beforeAll(async () => {
      const hash = await argon2.hash('password123');
      const u1 = await prisma.user.create({
        data: {
          tenantId,
          email: 'wf-val1@e2e-biz-gaps.com',
          passwordHash: hash,
          firstName: 'WF1',
          lastName: 'Test',
        },
      });
      wfUserId1 = u1.id;

      const u2 = await prisma.user.create({
        data: {
          tenantId,
          email: 'wf-val2@e2e-biz-gaps.com',
          passwordHash: hash,
          firstName: 'WF2',
          lastName: 'Test',
        },
      });
      wfUserId2 = u2.id;

      const u3 = await prisma.user.create({
        data: {
          tenantId,
          email: 'wf-val3@e2e-biz-gaps.com',
          passwordHash: hash,
          firstName: 'WF3',
          lastName: 'Test',
        },
      });
      wfUserId3 = u3.id;
    });

    it('rejects invalid workStartTime format with 400', async () => {
      const res = await api('post', '/workforce/profiles')
        .send({
          userId: wfUserId1,
          branchId,
          isWorker: true,
          workStartTime: 'abc',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('rejects efficiencyCoefficient > 10 with 400', async () => {
      await api('post', '/workforce/profiles')
        .send({
          userId: wfUserId2,
          branchId,
          isWorker: true,
          efficiencyCoefficient: 15,
        })
        .expect(400);
    });

    it('rejects efficiencyCoefficient < 0 with 400', async () => {
      await api('post', '/workforce/profiles')
        .send({
          userId: wfUserId3,
          branchId,
          isWorker: true,
          efficiencyCoefficient: -1,
        })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Work Posts - Branch Scope Enforcement
  // ---------------------------------------------------------------------------
  describe('Work Posts - Branch Scope Enforcement', () => {
    let branchBId: string;
    let branchScopedToken: string;

    beforeAll(async () => {
      // Create a second branch
      const branchB = await prisma.branch.create({
        data: { tenantId, name: 'Branch B' },
      });
      branchBId = branchB.id;

      // Create branch-scoped user assigned to Main Branch (branchId)
      const { userId } = await createLimitedUser(prisma, {
        tenantId,
        email: 'branch-scoped@e2e-biz-gaps.com',
        branchId,
        permissionSlugs: ['work-posts.create', 'work-posts.read'],
      });

      const tokens = await loginAs(
        app,
        tenantId,
        'branch-scoped@e2e-biz-gaps.com',
      );
      branchScopedToken = tokens.accessToken;
    });

    it('branch-scoped user cannot create work post for different branch', async () => {
      const res = await request(app.getHttpServer() as App)
        .post('/api/v1/work-posts')
        .set('Authorization', `Bearer ${branchScopedToken}`)
        .send({ name: 'Forbidden WP', branchId: branchBId })
        .expect(400);

      expect(res.body.message).toMatch(/different branch/i);
    });

    it('branch-scoped user can create work post for own branch', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/work-posts')
        .set('Authorization', `Bearer ${branchScopedToken}`)
        .send({ name: 'My Branch WP', branchId })
        .expect(201);
    });
  });
});
