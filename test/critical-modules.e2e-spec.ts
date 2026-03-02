import request from 'supertest';
import { App } from 'supertest/types';
import { INestApplication } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanupTenant, TestSetup } from './helpers/test-app';

/**
 * E2E tests for critical modules that lack coverage:
 *
 * - Payments: create payment, list by order
 * - Roles & Permissions: CRUD, permission assignment, soft delete/restore
 * - Workforce/Employee Profiles: create, update, deactivate, delete lifecycle
 * - Branches & Booking Settings: CRUD, booking settings upsert
 * - Work Posts: create, update, branch isolation
 * - Client Merge: vehicle deduplication, order re-pointing
 * - Auth edge cases: refresh, change password, invalid tokens
 * - Analytics: dashboard, revenue, KPI, live, employees, services, alerts
 */

const SLUG = 'e2e-critical-modules';

describe('Critical Modules (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let refreshToken: string;
  let tenantId: string;
  let branchId: string;

  beforeAll(async () => {
    const setup: TestSetup = await createTestApp(SLUG);
    app = setup.app;
    prisma = setup.prisma;
    accessToken = setup.accessToken;
    refreshToken = setup.refreshToken;
    tenantId = setup.testTenant.id;
    branchId = setup.testBranch.id;
  }, 30_000);

  afterAll(async () => {
    await cleanupTenant(prisma, tenantId, app);
  }, 15_000);

  // ─── Helpers ──────────────────────────────────────────

  function api(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return (request(app.getHttpServer()) as any)
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  // ═══════════════════════════════════════════════════════
  //  SECTION 1: PAYMENTS
  // ═══════════════════════════════════════════════════════

  describe('Payments', () => {
    let orderId: string;

    beforeAll(async () => {
      // Create service, client, vehicle, work post, and order for payment tests
      const svc = await prisma.service.create({
        data: { tenantId, name: 'Wash Pay', durationMin: 30, price: 300 },
      });
      const client = await prisma.client.create({
        data: {
          tenantId,
          firstName: 'Pay',
          lastName: 'Client',
          phone: '+380991110001',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          tenantId,
          clientId: client.id,
          make: 'BMW',
          licensePlate: 'PAY001',
        },
      });
      const wp = await prisma.workPost.create({
        data: { tenantId, branchId, name: 'Pay Post' },
      });

      // Create order
      const day = new Date();
      day.setUTCDate(day.getUTCDate() + 1);
      while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
      day.setUTCHours(10, 0, 0, 0);

      const res = await api('post', '/orders')
        .send({
          branchId,
          clientId: client.id,
          vehicleId: vehicle.id,
          workPostId: wp.id,
          serviceIds: [svc.id],
          scheduledStart: day.toISOString(),
        })
        .expect(201);

      orderId = res.body.data.id;
    });

    it('create payment for order with CASH method', async () => {
      const res = await api('post', `/orders/${orderId}/payments`)
        .send({
          amount: 300,
          method: 'CASH',
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        orderId,
        amount: '300',
        method: 'CASH',
        status: 'PAID',
      });
    });

    it('create payment with CARD method and reference', async () => {
      const res = await api('post', `/orders/${orderId}/payments`)
        .send({
          amount: 50,
          method: 'CARD',
          reference: 'TXN-12345',
        })
        .expect(201);

      expect(res.body.data.method).toBe('CARD');
      expect(res.body.data.reference).toBe('TXN-12345');
    });

    it('list payments by order', async () => {
      const res = await api('get', `/orders/${orderId}/payments`).expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('rejects payment with 0 amount', async () => {
      await api('post', `/orders/${orderId}/payments`)
        .send({
          amount: 0,
          method: 'CASH',
        })
        .expect(400);
    });

    it('rejects payment with invalid method', async () => {
      await api('post', `/orders/${orderId}/payments`)
        .send({
          amount: 100,
          method: 'BITCOIN',
        })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 2: ROLES & PERMISSIONS
  // ═══════════════════════════════════════════════════════

  describe('Roles & Permissions', () => {
    let roleId: string;
    let permissionIds: string[];

    it('list all available permissions', async () => {
      const res = await api('get', '/permissions').expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      permissionIds = res.body.data.slice(0, 3).map((p: any) => p.id);
    });

    it('get permissions filtered by module', async () => {
      const res = await api('get', '/permissions/orders').expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      res.body.data.forEach((p: any) => {
        expect(p.module).toBe('orders');
      });
    });

    it('create a role', async () => {
      const res = await api('post', '/roles')
        .send({
          name: 'Test Manager',
          description: 'Manager role for E2E tests',
        })
        .expect(201);

      expect(res.body.data.name).toBe('Test Manager');
      expect(res.body.data.permissions).toHaveLength(0);
      roleId = res.body.data.id;
    });

    it('list roles includes the new role', async () => {
      const res = await api('get', '/roles').expect(200);

      const names = res.body.data.map((r: any) => r.name);
      expect(names).toContain('Test Manager');
    });

    it('get role by id', async () => {
      const res = await api('get', `/roles/${roleId}`).expect(200);

      expect(res.body.data.id).toBe(roleId);
      expect(res.body.data.name).toBe('Test Manager');
    });

    it('update role name', async () => {
      const res = await api('patch', `/roles/${roleId}`)
        .send({
          name: 'Updated Manager',
        })
        .expect(200);

      expect(res.body.data.name).toBe('Updated Manager');
    });

    it('assign permissions to role', async () => {
      const res = await api('post', `/roles/${roleId}/permissions`)
        .send({
          permissionIds,
        })
        .expect(201);

      expect(res.body.data.permissions).toHaveLength(permissionIds.length);
    });

    it('re-assign permissions replaces all (idempotent)', async () => {
      // Assign only 1 permission — previous 3 should be replaced
      const res = await api('post', `/roles/${roleId}/permissions`)
        .send({
          permissionIds: [permissionIds[0]],
        })
        .expect(201);

      expect(res.body.data.permissions).toHaveLength(1);
    });

    it('assign empty permissions clears all', async () => {
      const res = await api('post', `/roles/${roleId}/permissions`)
        .send({
          permissionIds: [],
        })
        .expect(201);

      expect(res.body.data.permissions).toHaveLength(0);
    });

    it('soft delete role', async () => {
      await api('delete', `/roles/${roleId}`).expect(200);

      // Role should not appear in list
      const res = await api('get', '/roles').expect(200);
      const ids = res.body.data.map((r: any) => r.id);
      expect(ids).not.toContain(roleId);
    });

    it('get deleted role returns 404', async () => {
      await api('get', `/roles/${roleId}`).expect(404);
    });

    it('restore deleted role', async () => {
      const res = await api('patch', `/roles/${roleId}/restore`).expect(200);
      expect(res.body.data.id).toBe(roleId);
    });

    it('restore non-deleted role returns 400', async () => {
      await api('patch', `/roles/${roleId}/restore`).expect(400);
    });

    it('get non-existent role returns 404', async () => {
      await api('get', '/roles/00000000-0000-0000-0000-000000000000').expect(
        404,
      );
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 3: WORKFORCE / EMPLOYEE PROFILES
  // ═══════════════════════════════════════════════════════

  describe('Workforce / Employee Profiles', () => {
    let userId: string;
    let profileId: string;

    beforeAll(async () => {
      const hash = await argon2.hash('password123');
      const user = await prisma.user.create({
        data: {
          tenantId,
          email: `worker-test@${SLUG}.com`,
          passwordHash: hash,
          firstName: 'Test',
          lastName: 'Worker',
        },
      });
      userId = user.id;
    });

    it('create employee profile', async () => {
      const res = await api('post', '/workforce/profiles')
        .send({
          userId,
          branchId,
          isWorker: true,
          workStartTime: '09:00',
          workEndTime: '18:00',
          efficiencyCoefficient: 1.2,
        })
        .expect(201);

      expect(res.body.data).toMatchObject({
        isWorker: true,
        active: true,
        workStartTime: '09:00',
        workEndTime: '18:00',
      });
      profileId = res.body.data.id;
    });

    it('duplicate profile for same user returns 409', async () => {
      await api('post', '/workforce/profiles')
        .send({
          userId,
          branchId,
          isWorker: true,
        })
        .expect(409);
    });

    it('list profiles', async () => {
      const res = await api('get', '/workforce/profiles').expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const found = res.body.data.find((p: any) => p.id === profileId);
      expect(found).toBeTruthy();
    });

    it('list profiles filtered by branchId', async () => {
      const res = await api('get', '/workforce/profiles')
        .query({ branchId })
        .expect(200);

      res.body.data.forEach((p: any) => {
        expect(p.branch.id).toBe(branchId);
      });
    });

    it('get profile by id', async () => {
      const res = await api('get', `/workforce/profiles/${profileId}`).expect(
        200,
      );

      expect(res.body.data.id).toBe(profileId);
      expect(res.body.data.user).toBeTruthy();
      expect(res.body.data.branch).toBeTruthy();
    });

    it('update profile work hours', async () => {
      const res = await api('patch', `/workforce/profiles/${profileId}`)
        .send({
          workStartTime: '08:00',
          workEndTime: '20:00',
        })
        .expect(200);

      expect(res.body.data.workStartTime).toBe('08:00');
      expect(res.body.data.workEndTime).toBe('20:00');
    });

    it('update profile isWorker flag', async () => {
      const res = await api('patch', `/workforce/profiles/${profileId}`)
        .send({
          isWorker: false,
        })
        .expect(200);

      expect(res.body.data.isWorker).toBe(false);

      // Restore
      await api('patch', `/workforce/profiles/${profileId}`)
        .send({
          isWorker: true,
        })
        .expect(200);
    });

    it('deactivate profile (DELETE endpoint)', async () => {
      const res = await api(
        'delete',
        `/workforce/profiles/${profileId}`,
      ).expect(200);
      expect(res.body.data.active).toBe(false);
    });

    it('deactivated profile still visible in list with active filter', async () => {
      const active = await api('get', '/workforce/profiles')
        .query({ active: true })
        .expect(200);

      const inActive = active.body.data.find((p: any) => p.id === profileId);
      expect(inActive).toBeFalsy();

      const all = await api('get', '/workforce/profiles')
        .query({ active: false })
        .expect(200);

      const found = all.body.data.find((p: any) => p.id === profileId);
      expect(found).toBeTruthy();
    });

    it('get non-existent profile returns 404', async () => {
      await api(
        'get',
        '/workforce/profiles/00000000-0000-0000-0000-000000000000',
      ).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 4: BRANCHES & BOOKING SETTINGS
  // ═══════════════════════════════════════════════════════

  describe('Branches & Booking Settings', () => {
    let newBranchId: string;

    it('create branch', async () => {
      const res = await api('post', '/branches')
        .send({
          name: 'New Test Branch',
          address: 'Test Street 1',
        })
        .expect(201);

      expect(res.body.data.name).toBe('New Test Branch');
      newBranchId = res.body.data.id;
    });

    it('list branches includes new branch', async () => {
      const res = await api('get', '/branches').expect(200);

      const names = res.body.data.map((b: any) => b.name);
      expect(names).toContain('New Test Branch');
    });

    it('get branch by id', async () => {
      const res = await api('get', `/branches/${newBranchId}`).expect(200);
      expect(res.body.data.id).toBe(newBranchId);
    });

    it('update branch name', async () => {
      const res = await api('patch', `/branches/${newBranchId}`)
        .send({
          name: 'Renamed Branch',
        })
        .expect(200);

      expect(res.body.data.name).toBe('Renamed Branch');
    });

    it('get booking settings (empty → null/defaults)', async () => {
      const res = await api(
        'get',
        `/branches/${newBranchId}/booking-settings`,
      ).expect(200);
      // No branch-level settings yet, may return null
      // This verifies the endpoint works
      expect(res.status).toBe(200);
    });

    it('set booking settings for branch', async () => {
      const res = await api(
        'patch',
        `/branches/${newBranchId}/booking-settings`,
      )
        .send({
          slotDurationMinutes: 45,
          bufferTimeMinutes: 15,
          workingHoursStart: '07:00',
          workingHoursEnd: '22:00',
          workingDays: [1, 2, 3, 4, 5],
          allowOnlineBooking: false,
          maxAdvanceBookingDays: 14,
        })
        .expect(200);

      expect(res.body.data).toMatchObject({
        slotDurationMinutes: 45,
        bufferTimeMinutes: 15,
        workingHoursStart: '07:00',
        workingHoursEnd: '22:00',
        allowOnlineBooking: false,
        maxAdvanceBookingDays: 14,
      });
    });

    it('update booking settings (upsert)', async () => {
      const res = await api(
        'patch',
        `/branches/${newBranchId}/booking-settings`,
      )
        .send({
          slotDurationMinutes: 30,
        })
        .expect(200);

      expect(res.body.data.slotDurationMinutes).toBe(30);
    });

    it('booking settings validation rejects invalid HH:MM', async () => {
      await api('patch', `/branches/${newBranchId}/booking-settings`)
        .send({
          workingHoursStart: 'abc',
        })
        .expect(400);
    });

    it('booking settings validation rejects slot < 5 min', async () => {
      await api('patch', `/branches/${newBranchId}/booking-settings`)
        .send({
          slotDurationMinutes: 3,
        })
        .expect(400);
    });

    it('soft delete branch', async () => {
      await api('delete', `/branches/${newBranchId}`).expect(200);

      // Not in list anymore
      const res = await api('get', '/branches').expect(200);
      const ids = res.body.data.map((b: any) => b.id);
      expect(ids).not.toContain(newBranchId);
    });

    it('get deleted branch returns 404', async () => {
      await api('get', `/branches/${newBranchId}`).expect(404);
    });

    it('restore branch', async () => {
      const res = await api('patch', `/branches/${newBranchId}/restore`).expect(
        200,
      );
      expect(res.body.data.id).toBe(newBranchId);
    });

    it('restore non-deleted branch returns 400', async () => {
      await api('patch', `/branches/${newBranchId}/restore`).expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 5: WORK POSTS
  // ═══════════════════════════════════════════════════════

  describe('Work Posts', () => {
    let wpId: string;

    it('create work post', async () => {
      const res = await api('post', '/work-posts')
        .send({
          name: 'Test Bay Alpha',
          branchId,
        })
        .expect(201);

      expect(res.body.data.name).toBe('Test Bay Alpha');
      expect(res.body.data.branchId).toBe(branchId);
      expect(res.body.data.isActive).toBe(true);
      wpId = res.body.data.id;
    });

    it('list work posts by branch', async () => {
      const res = await api('get', '/work-posts')
        .query({ branchId })
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      const found = res.body.data.find((wp: any) => wp.id === wpId);
      expect(found).toBeTruthy();
    });

    it('get work post by id', async () => {
      const res = await api('get', `/work-posts/${wpId}`).expect(200);
      expect(res.body.data.id).toBe(wpId);
    });

    it('update work post name', async () => {
      const res = await api('patch', `/work-posts/${wpId}`)
        .send({
          name: 'Renamed Bay',
        })
        .expect(200);

      expect(res.body.data.name).toBe('Renamed Bay');
    });

    it('deactivate work post', async () => {
      const res = await api('patch', `/work-posts/${wpId}`)
        .send({
          isActive: false,
        })
        .expect(200);

      expect(res.body.data.isActive).toBe(false);
    });

    it('get non-existent work post returns 404', async () => {
      await api(
        'get',
        '/work-posts/00000000-0000-0000-0000-000000000000',
      ).expect(404);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 6: CLIENT MERGE
  // ═══════════════════════════════════════════════════════

  describe('Client Merge', () => {
    let sourceClientId: string;
    let targetClientId: string;
    let sourceVehicleId: string;
    let targetVehicleId: string;
    let sourceOrderId: string;

    beforeAll(async () => {
      // Create two clients
      const source = await prisma.client.create({
        data: {
          tenantId,
          firstName: 'Source',
          lastName: 'Client',
          phone: '+380991110010',
        },
      });
      const target = await prisma.client.create({
        data: {
          tenantId,
          firstName: 'Target',
          lastName: 'Client',
          phone: '+380991110020',
        },
      });
      sourceClientId = source.id;
      targetClientId = target.id;

      // Create vehicles — shared license plate AB1234 for dedup testing
      const sv = await prisma.vehicle.create({
        data: {
          tenantId,
          clientId: sourceClientId,
          make: 'Honda',
          licensePlate: 'AB1234',
        },
      });
      const tv = await prisma.vehicle.create({
        data: {
          tenantId,
          clientId: targetClientId,
          make: 'Toyota',
          licensePlate: 'AB1234',
        },
      });
      sourceVehicleId = sv.id;
      targetVehicleId = tv.id;

      // Create a unique vehicle on source (no duplicate)
      await prisma.vehicle.create({
        data: {
          tenantId,
          clientId: sourceClientId,
          make: 'Ford',
          licensePlate: 'UNIQUE99',
        },
      });

      // Create an order for source client
      const wp = await prisma.workPost.create({
        data: { tenantId, branchId, name: 'Merge Post' },
      });
      const svc = await prisma.service.create({
        data: { tenantId, name: 'Merge Svc', durationMin: 30, price: 100 },
      });

      const day = new Date();
      day.setUTCDate(day.getUTCDate() + 2);
      while (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
      day.setUTCHours(14, 0, 0, 0);

      const orderRes = await api('post', '/orders')
        .send({
          branchId,
          clientId: sourceClientId,
          vehicleId: sourceVehicleId,
          workPostId: wp.id,
          serviceIds: [svc.id],
          scheduledStart: day.toISOString(),
        })
        .expect(201);

      sourceOrderId = orderRes.body.data.id;
    });

    it('merge source into target with field overrides', async () => {
      const res = await api('post', '/clients/merge')
        .send({
          sourceClientId,
          targetClientId,
          fieldOverrides: {
            firstName: 'Merged',
            lastName: 'Customer',
            phone: '+380991110010',
          },
        })
        .expect(201);

      const merged = res.body.data;

      // Target client receives the overrides
      expect(merged.id).toBe(targetClientId);
      expect(merged.firstName).toBe('Merged');
      expect(merged.lastName).toBe('Customer');
    });

    it('source client is soft-deleted after merge', async () => {
      const res = await api('get', `/clients/${sourceClientId}`);
      expect(res.status).toBe(404);
    });

    it('duplicate vehicle (AB1234) is deduplicated — source vehicle soft-deleted', async () => {
      // Source vehicle should be soft-deleted since target already has AB1234
      const sourceVeh = await prisma.vehicle.findUnique({
        where: { id: sourceVehicleId },
      });
      expect(sourceVeh!.deletedAt).not.toBeNull();
    });

    it('unique vehicle (UNIQUE99) moved to target client', async () => {
      const unique = await prisma.vehicle.findFirst({
        where: { licensePlate: 'UNIQUE99', deletedAt: null },
      });
      expect(unique).not.toBeNull();
      expect(unique!.clientId).toBe(targetClientId);
    });

    it('order re-pointed from source to target client', async () => {
      const order = await prisma.order.findUnique({
        where: { id: sourceOrderId },
      });
      expect(order!.clientId).toBe(targetClientId);
    });

    it('order vehicle re-pointed to target duplicate vehicle', async () => {
      const order = await prisma.order.findUnique({
        where: { id: sourceOrderId },
      });
      expect(order!.vehicleId).toBe(targetVehicleId);
    });

    it('merge with same source and target rejected', async () => {
      await api('post', '/clients/merge')
        .send({
          sourceClientId: targetClientId,
          targetClientId: targetClientId,
          fieldOverrides: { firstName: 'Nope' },
        })
        .expect(400);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 7: AUTH EDGE CASES
  // ═══════════════════════════════════════════════════════

  describe('Auth Edge Cases', () => {
    it('refresh token returns new access+refresh tokens', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(res.body.data.accessToken).toBeTruthy();
      expect(res.body.data.refreshToken).toBeTruthy();
      expect(res.body.data.user).toBeTruthy();
    });

    it('refresh with invalid token returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid.jwt.token' })
        .expect(401);
    });

    it('refresh with access token (wrong type) returns 401', async () => {
      // Access token has type: 'access', should be rejected
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: accessToken })
        .expect(401);
    });

    it('change password works with correct current password', async () => {
      await api('patch', '/auth/change-password')
        .send({
          currentPassword: 'password123',
          newPassword: 'newPassword456',
        })
        .expect(204);

      // Verify login with new password works
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: `admin@${SLUG}.com`,
          password: 'newPassword456',
        })
        .expect(200);

      // Update tokens for subsequent tests
      accessToken = loginRes.body.data.accessToken;
      refreshToken = loginRes.body.data.refreshToken;
    });

    it('change password fails with wrong current password', async () => {
      await api('patch', '/auth/change-password')
        .send({
          currentPassword: 'wrongPassword',
          newPassword: 'anything',
        })
        .expect(400);
    });

    it('login with wrong password returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: `admin@${SLUG}.com`,
          password: 'wrongPassword',
        })
        .expect(401);
    });

    it('login with non-existent email returns 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          tenantId,
          email: 'nobody@nowhere.com',
          password: 'password123',
        })
        .expect(401);
    });

    it('protected endpoint without token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    });

    it('protected endpoint with invalid token returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/orders')
        .set('Authorization', 'Bearer invalid.jwt.token')
        .expect(401);
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 8: ANALYTICS
  // ═══════════════════════════════════════════════════════

  describe('Analytics', () => {
    const dateFrom = new Date(Date.now() - 30 * 86400000).toISOString();
    const dateTo = new Date().toISOString();

    it('dashboard returns stats', async () => {
      const res = await api('get', '/analytics/dashboard')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('revenue endpoint returns data', async () => {
      const res = await api('get', '/analytics/revenue')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('popular services endpoint returns data', async () => {
      const res = await api('get', '/analytics/services')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('KPI endpoint returns data', async () => {
      const res = await api('get', '/analytics/kpi')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('live operations returns data', async () => {
      const res = await api('get', '/analytics/live').expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('branch performance returns data', async () => {
      const res = await api('get', '/analytics/branches')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('employee performance returns data', async () => {
      const res = await api('get', '/analytics/employees')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('alerts returns data', async () => {
      const res = await api('get', '/analytics/alerts')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('online booking stats returns data', async () => {
      const res = await api('get', '/analytics/online-booking')
        .query({ dateFrom, dateTo })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });

    it('analytics with branchId filter works', async () => {
      const res = await api('get', '/analytics/dashboard')
        .query({ dateFrom, dateTo, branchId })
        .expect(200);

      expect(res.body.data).toBeTruthy();
    });
  });

  // ═══════════════════════════════════════════════════════
  //  SECTION 9: CLIENT SOFT DELETE / RESTORE LIFECYCLE
  // ═══════════════════════════════════════════════════════

  describe('Client Soft Delete & Restore', () => {
    let clientId: string;

    beforeAll(async () => {
      const res = await api('post', '/clients')
        .send({
          firstName: 'Delete',
          lastName: 'TestClient',
          phone: '+380991119999',
        })
        .expect(201);
      clientId = res.body.data.id;
    });

    it('soft delete client', async () => {
      await api('delete', `/clients/${clientId}`).expect(200);
    });

    it('deleted client returns 404 on GET', async () => {
      await api('get', `/clients/${clientId}`).expect(404);
    });

    it('restore deleted client', async () => {
      const res = await api('patch', `/clients/${clientId}/restore`).expect(
        200,
      );
      expect(res.body.data.id).toBe(clientId);
    });

    it('restore non-deleted client returns 400', async () => {
      await api('patch', `/clients/${clientId}/restore`).expect(400);
    });

    it('restored client visible again', async () => {
      const res = await api('get', `/clients/${clientId}`).expect(200);
      expect(res.body.data.firstName).toBe('Delete');
    });
  });
});
