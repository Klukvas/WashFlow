import request from 'supertest';
import { App } from 'supertest/types';
import * as argon2 from 'argon2';
import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  createTestApp,
  deleteTenantData,
  createLimitedUser,
  loginAs,
  nextWorkday,
} from './helpers/test-app';

/**
 * Security E2E tests: multi-tenant isolation, permission enforcement, branch scoping.
 */
describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tenant A (created via createTestApp)
  let tenantA: { id: string };
  let branchA1: { id: string };
  let tokenA: string; // superAdmin token for Tenant A

  // Tenant A second branch + order
  let branchA2: { id: string };
  let orderA1Id: string;
  let orderA2Id: string;
  let clientAId: string;

  // Tenant B (created manually within the same app)
  let tenantB: { id: string };
  let branchB: { id: string };
  let tokenB: string;
  let orderBId: string;
  let clientBId: string;

  // Tenant B entity IDs for cross-tenant isolation tests
  let serviceBId: string;
  let vehicleBId: string;
  let workPostBId: string;
  let userBId: string;
  let roleBId: string;

  // Limited users on Tenant A
  let noPermsToken: string;
  let ordersOnlyToken: string;
  let branchScopedToken: string;

  const api = (tkn: string) => {
    const server = app.getHttpServer() as App;
    return {
      get: (url: string) =>
        request(server).get(url).set('Authorization', `Bearer ${tkn}`),
      post: (url: string) =>
        request(server).post(url).set('Authorization', `Bearer ${tkn}`),
      patch: (url: string) =>
        request(server).patch(url).set('Authorization', `Bearer ${tkn}`),
      delete: (url: string) =>
        request(server).delete(url).set('Authorization', `Bearer ${tkn}`),
    };
  };

  /** Helper: api() with custom headers */
  const apiWithHeaders = (tkn: string, headers: Record<string, string>) => {
    const server = app.getHttpServer() as App;
    return {
      get: (url: string) => {
        const req = request(server)
          .get(url)
          .set('Authorization', `Bearer ${tkn}`);
        for (const [k, v] of Object.entries(headers)) req.set(k, v);
        return req;
      },
    };
  };

  beforeAll(async () => {
    // --- Tenant A via helper ---
    const setup = await createTestApp('e2e-sec-a');
    app = setup.app;
    prisma = setup.prisma;
    tenantA = setup.testTenant;
    branchA1 = setup.testBranch;
    tokenA = setup.accessToken;

    // Create a service for Tenant A
    const serviceA = await prisma.service.create({
      data: {
        tenantId: tenantA.id,
        name: 'Basic Wash A',
        durationMin: 30,
        price: 50,
      },
    });

    // Create client + vehicle for Tenant A
    const clientA = await prisma.client.create({
      data: {
        tenantId: tenantA.id,
        firstName: 'Sec',
        lastName: 'ClientA',
        phone: '+380990010001',
      },
    });
    clientAId = clientA.id;

    const vehicleA = await prisma.vehicle.create({
      data: {
        tenantId: tenantA.id,
        clientId: clientA.id,
        licensePlate: 'SEC-A-001',
        make: 'Toyota',
      },
    });

    // Work post for branchA1
    const wpA1 = await prisma.workPost.create({
      data: { tenantId: tenantA.id, branchId: branchA1.id, name: 'WP A1' },
    });

    // Order on branchA1 (created directly via Prisma — no scheduling check needed)
    const startA1 = nextWorkday(10, 5);
    const endA1 = new Date(startA1.getTime() + 30 * 60 * 1000);
    const oA1 = await prisma.order.create({
      data: {
        tenantId: tenantA.id,
        branchId: branchA1.id,
        clientId: clientA.id,
        vehicleId: vehicleA.id,
        workPostId: wpA1.id,
        scheduledStart: startA1,
        scheduledEnd: endA1,
        totalPrice: 50,
        status: 'BOOKED',
      },
    });
    orderA1Id = oA1.id;
    await prisma.orderService.create({
      data: {
        tenantId: tenantA.id,
        orderId: oA1.id,
        serviceId: serviceA.id,
        price: 50,
      },
    });

    // Second branch A2 with order
    const bA2 = await prisma.branch.create({
      data: { tenantId: tenantA.id, name: 'Branch A2' },
    });
    branchA2 = bA2;

    const wpA2 = await prisma.workPost.create({
      data: { tenantId: tenantA.id, branchId: branchA2.id, name: 'WP A2' },
    });

    const startA2 = nextWorkday(11, 5);
    const endA2 = new Date(startA2.getTime() + 30 * 60 * 1000);
    const oA2 = await prisma.order.create({
      data: {
        tenantId: tenantA.id,
        branchId: branchA2.id,
        clientId: clientA.id,
        vehicleId: vehicleA.id,
        workPostId: wpA2.id,
        scheduledStart: startA2,
        scheduledEnd: endA2,
        totalPrice: 50,
        status: 'BOOKED',
      },
    });
    orderA2Id = oA2.id;
    await prisma.orderService.create({
      data: {
        tenantId: tenantA.id,
        orderId: oA2.id,
        serviceId: serviceA.id,
        price: 50,
      },
    });

    // --- Tenant B (created via direct Prisma in the same app) ---
    const existingB = await prisma.tenant.findUnique({
      where: { slug: 'e2e-sec-b' },
    });
    if (existingB) {
      await deleteTenantData(prisma, existingB.id);
    }

    const tB = await prisma.tenant.create({
      data: { name: 'Test e2e-sec-b', slug: 'e2e-sec-b' },
    });
    tenantB = tB;

    await prisma.bookingSettings.create({
      data: {
        tenantId: tenantB.id,
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
      },
    });

    const bB = await prisma.branch.create({
      data: { tenantId: tenantB.id, name: 'Branch B' },
    });
    branchB = bB;

    // Role for Tenant B (used in cross-tenant isolation tests)
    const roleB = await prisma.role.create({
      data: { tenantId: tenantB.id, name: 'Staff B' },
    });
    roleBId = roleB.id;

    const passwordHash = await argon2.hash('password123');
    const adminB = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        email: 'admin@sec-b.com',
        passwordHash,
        firstName: 'Admin',
        lastName: 'B',
        isSuperAdmin: true,
      },
    });
    userBId = adminB.id;

    const tokensB = await loginAs(app, tenantB.id, 'admin@sec-b.com');
    tokenB = tokensB.accessToken;

    const serviceB = await prisma.service.create({
      data: {
        tenantId: tenantB.id,
        name: 'Basic Wash B',
        durationMin: 30,
        price: 60,
      },
    });
    serviceBId = serviceB.id;

    const clientB = await prisma.client.create({
      data: {
        tenantId: tenantB.id,
        firstName: 'Sec',
        lastName: 'ClientB',
        phone: '+380990020001',
      },
    });
    clientBId = clientB.id;

    const vehicleB = await prisma.vehicle.create({
      data: {
        tenantId: tenantB.id,
        clientId: clientB.id,
        licensePlate: 'SEC-B-001',
        make: 'Honda',
      },
    });
    vehicleBId = vehicleB.id;

    const wpB = await prisma.workPost.create({
      data: { tenantId: tenantB.id, branchId: branchB.id, name: 'WP B' },
    });
    workPostBId = wpB.id;

    const startB = nextWorkday(12, 5);
    const endB = new Date(startB.getTime() + 30 * 60 * 1000);
    const oB = await prisma.order.create({
      data: {
        tenantId: tenantB.id,
        branchId: branchB.id,
        clientId: clientB.id,
        vehicleId: vehicleB.id,
        workPostId: wpB.id,
        scheduledStart: startB,
        scheduledEnd: endB,
        totalPrice: 60,
        status: 'BOOKED',
      },
    });
    orderBId = oB.id;
    await prisma.orderService.create({
      data: {
        tenantId: tenantB.id,
        orderId: oB.id,
        serviceId: serviceB.id,
        price: 60,
      },
    });

    // --- Limited users on Tenant A ---
    // 1. noPermsUser — zero permissions
    await createLimitedUser(prisma, {
      tenantId: tenantA.id,
      email: 'no-perms@sec-a.com',
      permissionSlugs: [],
    });
    const noPTokens = await loginAs(app, tenantA.id, 'no-perms@sec-a.com');
    noPermsToken = noPTokens.accessToken;

    // 2. ordersOnlyUser — only order permissions
    await createLimitedUser(prisma, {
      tenantId: tenantA.id,
      email: 'orders-only@sec-a.com',
      permissionSlugs: ['orders.read', 'orders.create', 'orders.update'],
    });
    const ooTokens = await loginAs(app, tenantA.id, 'orders-only@sec-a.com');
    ordersOnlyToken = ooTokens.accessToken;

    // 3. branchScopedUser — broad permissions but scoped to branchA1
    await createLimitedUser(prisma, {
      tenantId: tenantA.id,
      email: 'branch-scoped@sec-a.com',
      branchId: branchA1.id,
      permissionSlugs: [
        'orders.read',
        'orders.create',
        'orders.update',
        'orders.delete',
        'clients.read',
        'clients.create',
        'analytics.view',
      ],
    });
    const bsTokens = await loginAs(app, tenantA.id, 'branch-scoped@sec-a.com');
    branchScopedToken = bsTokens.accessToken;
  }, 120_000);

  afterAll(async () => {
    if (tenantB?.id) await deleteTenantData(prisma, tenantB.id);
    if (tenantA?.id) await deleteTenantData(prisma, tenantA.id);
    await app.close();
  }, 30_000);

  // ====================================================================
  // SECTION 1: Multi-Tenant Isolation
  // ====================================================================
  describe('Multi-Tenant Isolation', () => {
    // --- Orders & Clients (existing) ---
    it('Tenant A lists orders — no Tenant B orders appear', async () => {
      const res = await api(tokenA).get('/api/v1/orders').expect(200);
      const ids: string[] = res.body.data.map((o: { id: string }) => o.id);
      expect(ids).not.toContain(orderBId);
    });

    it('Tenant A GET /orders/:orderBId → 404', async () => {
      await api(tokenA).get(`/api/v1/orders/${orderBId}`).expect(404);
    });

    it('Tenant A lists clients — no Tenant B clients appear', async () => {
      const res = await api(tokenA).get('/api/v1/clients').expect(200);
      const ids: string[] = res.body.data.map((c: { id: string }) => c.id);
      expect(ids).not.toContain(clientBId);
    });

    it('Tenant A GET /clients/:clientBId → 404', async () => {
      await api(tokenA).get(`/api/v1/clients/${clientBId}`).expect(404);
    });

    it('Tenant A PATCH /orders/:orderBId/status → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/orders/${orderBId}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(404);
    });

    it('Tenant A POST order referencing Tenant B entities → 400/404', async () => {
      const res = await api(tokenA)
        .post('/api/v1/orders')
        .send({
          branchId: branchA1.id,
          clientId: clientBId, // Tenant B client
          vehicleId: '00000000-0000-0000-0000-000000000001',
          scheduledStart: nextWorkday(14, 6).toISOString(),
          serviceIds: ['00000000-0000-0000-0000-000000000002'],
        });
      expect([400, 404]).toContain(res.status);
    });

    it('Tenant A DELETE /clients/:clientBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/clients/${clientBId}`).expect(404);
    });

    it('Tenant B GET /orders/:orderA1Id → 404', async () => {
      await api(tokenB).get(`/api/v1/orders/${orderA1Id}`).expect(404);
    });

    it('Tenant B GET /clients/:clientAId → 404', async () => {
      await api(tokenB).get(`/api/v1/clients/${clientAId}`).expect(404);
    });

    // --- Cross-Tenant Payment (fixed vulnerability) ---
    it('Tenant B POST payment on Tenant A order → 404', async () => {
      await api(tokenB)
        .post(`/api/v1/orders/${orderA1Id}/payments`)
        .send({ amount: 50, method: 'CASH' })
        .expect(404);
    });

    // --- Services ---
    it('Tenant A lists services — no Tenant B services appear', async () => {
      const res = await api(tokenA).get('/api/v1/services').expect(200);
      const ids: string[] = res.body.data.map((s: { id: string }) => s.id);
      expect(ids).not.toContain(serviceBId);
    });

    it('Tenant A GET /services/:serviceBId → 404', async () => {
      await api(tokenA).get(`/api/v1/services/${serviceBId}`).expect(404);
    });

    it('Tenant A PATCH /services/:serviceBId → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/services/${serviceBId}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('Tenant A DELETE /services/:serviceBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/services/${serviceBId}`).expect(404);
    });

    // --- Vehicles ---
    it('Tenant A lists vehicles — no Tenant B vehicles appear', async () => {
      const res = await api(tokenA).get('/api/v1/vehicles').expect(200);
      const ids: string[] = res.body.data.map((v: { id: string }) => v.id);
      expect(ids).not.toContain(vehicleBId);
    });

    it('Tenant A GET /vehicles/:vehicleBId → 404', async () => {
      await api(tokenA).get(`/api/v1/vehicles/${vehicleBId}`).expect(404);
    });

    it('Tenant A PATCH /vehicles/:vehicleBId → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/vehicles/${vehicleBId}`)
        .send({ make: 'Hacked' })
        .expect(404);
    });

    it('Tenant A DELETE /vehicles/:vehicleBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/vehicles/${vehicleBId}`).expect(404);
    });

    // --- Work Posts ---
    it('Tenant A lists work-posts — no Tenant B work-posts appear', async () => {
      const res = await api(tokenA)
        .get(`/api/v1/work-posts?branchId=${branchA1.id}`)
        .expect(200);
      const ids: string[] = res.body.data.map((w: { id: string }) => w.id);
      expect(ids).not.toContain(workPostBId);
    });

    it('Tenant A GET /work-posts/:workPostBId → 404', async () => {
      await api(tokenA).get(`/api/v1/work-posts/${workPostBId}`).expect(404);
    });

    it('Tenant A PATCH /work-posts/:workPostBId → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/work-posts/${workPostBId}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('Tenant A DELETE /work-posts/:workPostBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/work-posts/${workPostBId}`).expect(404);
    });

    // --- Branches ---
    it('Tenant A lists branches — no Tenant B branches appear', async () => {
      const res = await api(tokenA).get('/api/v1/branches').expect(200);
      const ids: string[] = res.body.data.map((b: { id: string }) => b.id);
      expect(ids).not.toContain(branchB.id);
    });

    it('Tenant A GET /branches/:branchBId → 404', async () => {
      await api(tokenA).get(`/api/v1/branches/${branchB.id}`).expect(404);
    });

    it('Tenant A PATCH /branches/:branchBId → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/branches/${branchB.id}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('Tenant A DELETE /branches/:branchBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/branches/${branchB.id}`).expect(404);
    });

    // --- Roles ---
    it('Tenant A lists roles — no Tenant B roles appear', async () => {
      const res = await api(tokenA).get('/api/v1/roles').expect(200);
      const ids: string[] = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).not.toContain(roleBId);
    });

    it('Tenant A GET /roles/:roleBId → 404', async () => {
      await api(tokenA).get(`/api/v1/roles/${roleBId}`).expect(404);
    });

    it('Tenant A PATCH /roles/:roleBId → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/roles/${roleBId}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('Tenant A DELETE /roles/:roleBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/roles/${roleBId}`).expect(404);
    });

    // --- Users ---
    it('Tenant A lists users — no Tenant B users appear', async () => {
      const res = await api(tokenA).get('/api/v1/users').expect(200);
      const ids: string[] = res.body.data.map((u: { id: string }) => u.id);
      expect(ids).not.toContain(userBId);
    });

    it('Tenant A GET /users/:userBId → 404', async () => {
      await api(tokenA).get(`/api/v1/users/${userBId}`).expect(404);
    });

    it('Tenant A PATCH /users/:userBId → 404', async () => {
      await api(tokenA)
        .patch(`/api/v1/users/${userBId}`)
        .send({ firstName: 'Hacked' })
        .expect(404);
    });

    it('Tenant A DELETE /users/:userBId → 404', async () => {
      await api(tokenA).delete(`/api/v1/users/${userBId}`).expect(404);
    });
  });

  // ====================================================================
  // SECTION 2: Permission Enforcement
  // ====================================================================
  describe('Permission Enforcement', () => {
    describe('No-permission user (expect 403)', () => {
      it('GET /orders → 403', async () => {
        await api(noPermsToken).get('/api/v1/orders').expect(403);
      });

      it('POST /orders → 403', async () => {
        await api(noPermsToken).post('/api/v1/orders').send({}).expect(403);
      });

      it('GET /clients → 403', async () => {
        await api(noPermsToken).get('/api/v1/clients').expect(403);
      });

      it('GET /analytics/dashboard → 403', async () => {
        await api(noPermsToken).get('/api/v1/analytics/dashboard').expect(403);
      });

      it('GET /services → 403', async () => {
        await api(noPermsToken).get('/api/v1/services').expect(403);
      });

      it('GET /audit-logs → 403', async () => {
        await api(noPermsToken).get('/api/v1/audit-logs').expect(403);
      });

      // --- Additional modules ---
      it('GET /roles → 403', async () => {
        await api(noPermsToken).get('/api/v1/roles').expect(403);
      });

      it('GET /users → 403', async () => {
        await api(noPermsToken).get('/api/v1/users').expect(403);
      });

      it('GET /branches → 403', async () => {
        await api(noPermsToken).get('/api/v1/branches').expect(403);
      });

      it('GET /vehicles → 403', async () => {
        await api(noPermsToken).get('/api/v1/vehicles').expect(403);
      });

      it('GET /work-posts → 403', async () => {
        await api(noPermsToken).get('/api/v1/work-posts').expect(403);
      });

      it('GET /workforce/profiles → 403', async () => {
        await api(noPermsToken).get('/api/v1/workforce/profiles').expect(403);
      });

      it('GET /orders/:id/payments → 403', async () => {
        await api(noPermsToken)
          .get(`/api/v1/orders/${orderA1Id}/payments`)
          .expect(403);
      });
    });

    describe('Orders-only user', () => {
      it('GET /orders → 200', async () => {
        await api(ordersOnlyToken).get('/api/v1/orders').expect(200);
      });

      it('GET /clients → 403 (no clients.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/clients').expect(403);
      });

      it('GET /services → 403 (no services.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/services').expect(403);
      });

      it('GET /analytics/dashboard → 403 (no analytics.view)', async () => {
        await api(ordersOnlyToken)
          .get('/api/v1/analytics/dashboard')
          .expect(403);
      });

      it('DELETE /orders/:id → 403 (no orders.delete)', async () => {
        await api(ordersOnlyToken)
          .delete(`/api/v1/orders/${orderA1Id}`)
          .expect(403);
      });

      // --- Additional modules ---
      it('GET /roles → 403 (no roles.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/roles').expect(403);
      });

      it('GET /users → 403 (no users.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/users').expect(403);
      });

      it('GET /branches → 403 (no branches.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/branches').expect(403);
      });

      it('GET /vehicles → 403 (no vehicles.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/vehicles').expect(403);
      });

      it('GET /work-posts → 403 (no work-posts.read)', async () => {
        await api(ordersOnlyToken).get('/api/v1/work-posts').expect(403);
      });

      it('GET /workforce/profiles → 403 (no workforce.read)', async () => {
        await api(ordersOnlyToken)
          .get('/api/v1/workforce/profiles')
          .expect(403);
      });

      it('GET /orders/:id/payments → 403 (no payments.read)', async () => {
        await api(ordersOnlyToken)
          .get(`/api/v1/orders/${orderA1Id}/payments`)
          .expect(403);
      });
    });

    describe('SuperAdmin bypass', () => {
      it('GET /analytics/dashboard → 200', async () => {
        await api(tokenA).get('/api/v1/analytics/dashboard').expect(200);
      });

      it('GET /audit-logs → 200', async () => {
        await api(tokenA).get('/api/v1/audit-logs').expect(200);
      });
    });
  });

  // ====================================================================
  // SECTION 3: Branch Scoping
  // ====================================================================
  describe('Branch Scoping', () => {
    it('Branch-scoped user sees only branchA1 orders', async () => {
      const res = await api(branchScopedToken)
        .get('/api/v1/orders')
        .expect(200);
      const data = res.body.data;
      expect(data.length).toBeGreaterThanOrEqual(1);
      for (const order of data) {
        expect(order.branchId).toBe(branchA1.id);
      }
    });

    it('Branch-scoped user GET /orders/:orderA2Id (branchA2) → 404', async () => {
      await api(branchScopedToken)
        .get(`/api/v1/orders/${orderA2Id}`)
        .expect(404);
    });

    it('Branch-scoped user PATCH /orders/:orderA2Id/status → 404', async () => {
      await api(branchScopedToken)
        .patch(`/api/v1/orders/${orderA2Id}/status`)
        .send({ status: 'IN_PROGRESS' })
        .expect(404);
    });

    it('Branch-scoped user POST order with branchId=branchA2 → 400', async () => {
      // Use the real vehicleA + serviceA that exist in Tenant A
      const vehicles = await prisma.vehicle.findMany({
        where: { tenantId: tenantA.id },
      });
      const services = await prisma.service.findMany({
        where: { tenantId: tenantA.id },
      });
      const res = await api(branchScopedToken)
        .post('/api/v1/orders')
        .send({
          branchId: branchA2.id,
          clientId: clientAId,
          vehicleId: vehicles[0].id,
          scheduledStart: nextWorkday(15, 7).toISOString(),
          serviceIds: [services[0].id],
        })
        .expect(400);
      expect(res.body.message).toMatch(/different branch/i);
    });

    it('Branch-scoped user GET /analytics/dashboard scoped to branchA1', async () => {
      await api(branchScopedToken)
        .get('/api/v1/analytics/dashboard')
        .expect(200);
    });

    it('Tenant-wide admin sees orders from both branches', async () => {
      const res = await api(tokenA).get('/api/v1/orders').expect(200);
      const branchIds: string[] = res.body.data.map(
        (o: { branchId: string }) => o.branchId,
      );
      expect(branchIds).toContain(branchA1.id);
      expect(branchIds).toContain(branchA2.id);
    });
  });

  // ====================================================================
  // SECTION 4: SuperAdmin x-tenant-id Override
  // ====================================================================
  describe('SuperAdmin x-tenant-id Override', () => {
    it('SuperAdmin with x-tenant-id header can access Tenant B orders', async () => {
      const res = await apiWithHeaders(tokenA, {
        'x-tenant-id': tenantB.id,
      }).get('/api/v1/orders');
      expect(res.status).toBe(200);
      const ids: string[] = res.body.data.map((o: { id: string }) => o.id);
      expect(ids).toContain(orderBId);
    });

    it('SuperAdmin with invalid x-tenant-id → 400', async () => {
      await apiWithHeaders(tokenA, {
        'x-tenant-id': 'not-a-uuid',
      })
        .get('/api/v1/orders')
        .expect(400);
    });

    it('Non-superAdmin with x-tenant-id header cannot override tenant context', async () => {
      // ordersOnlyToken is a regular user — should ignore x-tenant-id
      const res = await apiWithHeaders(ordersOnlyToken, {
        'x-tenant-id': tenantB.id,
      }).get('/api/v1/orders');

      // Should still see Tenant A orders (header ignored for non-superAdmin)
      expect(res.status).toBe(200);
      const ids: string[] = res.body.data.map((o: { id: string }) => o.id);
      expect(ids).not.toContain(orderBId);
    });

    it('SuperAdmin with x-tenant-id for non-existent tenant → 400', async () => {
      await apiWithHeaders(tokenA, {
        'x-tenant-id': '00000000-0000-0000-0000-000000000099',
      })
        .get('/api/v1/orders')
        .expect(400);
    });
  });

  // ====================================================================
  // SECTION 5: Role Lifecycle & Permission Propagation
  // ====================================================================
  describe('Role Lifecycle & Permission Propagation', () => {
    it('user with soft-deleted role gets 403 on protected endpoints', async () => {
      // Create a user with orders.read, then soft-delete their role
      const { userId, roleId } = await createLimitedUser(prisma, {
        tenantId: tenantA.id,
        email: 'deleted-role@sec-a.com',
        permissionSlugs: ['orders.read'],
      });

      // Login before deleting role
      const tokens = await loginAs(app, tenantA.id, 'deleted-role@sec-a.com');

      // Soft-delete the role
      await prisma.role.update({
        where: { id: roleId },
        data: { deletedAt: new Date() },
      });

      // Re-login — user should get empty permissions now
      const newTokens = await loginAs(
        app,
        tenantA.id,
        'deleted-role@sec-a.com',
      );

      // With no permissions, accessing orders should be 403
      await api(newTokens.accessToken).get('/api/v1/orders').expect(403);

      // Cleanup: restore the role and delete test user
      await prisma.role.update({
        where: { id: roleId },
        data: { deletedAt: null },
      });
    });

    it('permission changes are reflected after re-login', async () => {
      // Create user with orders.read
      const { userId, roleId } = await createLimitedUser(prisma, {
        tenantId: tenantA.id,
        email: 'perm-change@sec-a.com',
        permissionSlugs: ['orders.read'],
      });

      const tokens1 = await loginAs(app, tenantA.id, 'perm-change@sec-a.com');

      // Can read orders
      await api(tokens1.accessToken).get('/api/v1/orders').expect(200);

      // Cannot read clients
      await api(tokens1.accessToken).get('/api/v1/clients').expect(403);

      // Add clients.read permission to the role
      const clientsReadPerm = await prisma.permission.findFirst({
        where: { module: 'clients', action: 'read' },
      });
      await prisma.rolePermission.create({
        data: { roleId, permissionId: clientsReadPerm!.id },
      });

      // Re-login to get updated permissions
      const tokens2 = await loginAs(app, tenantA.id, 'perm-change@sec-a.com');

      // Now can read clients
      await api(tokens2.accessToken).get('/api/v1/clients').expect(200);
    });

    it('removing a permission is reflected after re-login', async () => {
      const { userId, roleId } = await createLimitedUser(prisma, {
        tenantId: tenantA.id,
        email: 'perm-revoke@sec-a.com',
        permissionSlugs: ['orders.read', 'clients.read'],
      });

      const tokens1 = await loginAs(app, tenantA.id, 'perm-revoke@sec-a.com');
      await api(tokens1.accessToken).get('/api/v1/clients').expect(200);

      // Remove clients.read from the role
      const clientsReadPerm = await prisma.permission.findFirst({
        where: { module: 'clients', action: 'read' },
      });
      await prisma.rolePermission.deleteMany({
        where: { roleId, permissionId: clientsReadPerm!.id },
      });

      // Re-login
      const tokens2 = await loginAs(app, tenantA.id, 'perm-revoke@sec-a.com');

      // Clients should now be 403
      await api(tokens2.accessToken).get('/api/v1/clients').expect(403);

      // Orders still works
      await api(tokens2.accessToken).get('/api/v1/orders').expect(200);
    });
  });

  // ====================================================================
  // SECTION 6: Soft-Deleted & Inactive User Access
  // ====================================================================
  describe('Soft-Deleted & Inactive User Access', () => {
    it('soft-deleted user cannot login', async () => {
      const { userId } = await createLimitedUser(prisma, {
        tenantId: tenantA.id,
        email: 'soft-deleted@sec-a.com',
        permissionSlugs: ['orders.read'],
      });

      // Soft-delete the user
      await prisma.user.update({
        where: { id: userId },
        data: { deletedAt: new Date() },
      });

      const server = app.getHttpServer() as App;
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'soft-deleted@sec-a.com', password: 'password123' })
        .expect(401);
    });

    it('deactivated user cannot login', async () => {
      const { userId } = await createLimitedUser(prisma, {
        tenantId: tenantA.id,
        email: 'inactive@sec-a.com',
        permissionSlugs: ['orders.read'],
      });

      await prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      const server = app.getHttpServer() as App;
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: 'inactive@sec-a.com', password: 'password123' })
        .expect(401);
    });

    it('user deactivated after login cannot refresh token', async () => {
      const { userId } = await createLimitedUser(prisma, {
        tenantId: tenantA.id,
        email: 'deactivated-refresh@sec-a.com',
        permissionSlugs: ['orders.read'],
      });

      const tokens = await loginAs(
        app,
        tenantA.id,
        'deactivated-refresh@sec-a.com',
      );

      // Deactivate the user after login
      await prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
      });

      // Try to refresh — should fail
      const server = app.getHttpServer() as App;
      await request(server)
        .post('/api/v1/auth/refresh')
        .set('Cookie', [`refresh_token=${tokens.refreshToken}`])
        .expect(401);
    });
  });
});
