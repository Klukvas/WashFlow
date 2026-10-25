import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createP0Harness } from './p0-critical-harness';

const integration =
  process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL !== undefined
    ? describe
    : describe.skip;
integration(
  'P0 critical workflows — isolated PostgreSQL + guarded HTTP',
  () => {
    let h: Awaited<ReturnType<typeof createP0Harness>>;
    beforeAll(async () => {
      h = await createP0Harness();
    });
    afterAll(async () => {
      if (h) await h.close();
    });
    const paymentBody = { amount: 25, method: 'CASH' };
    function paymentPath(id: string) {
      return `/api/v1/orders/${id}/payments`;
    }
    function postPayment(
      id: string,
      token: string,
      key?: string,
      body = paymentBody,
    ) {
      const call = request(h.app.getHttpServer())
        .post(paymentPath(id))
        .auth(token, { type: 'bearer' });
      if (key !== undefined) call.set('idempotency-key', key);
      return call.send(body);
    }
    function availability(
      f: Awaited<ReturnType<typeof h.fixture>>,
      token: string,
      query: Record<string, unknown> = {},
    ) {
      return request(h.app.getHttpServer())
        .get('/api/v1/orders/availability')
        .auth(token, { type: 'bearer' })
        .query({
          branchId: f.branch.id,
          date: f.start.toISOString().slice(0, 10),
          ...query,
        });
    }
    it('denies payment GET/POST across branches before reading or writing', async () => {
      const f = await h.fixture();
      const token = h.token(f.tenantId, { branchId: f.otherBranch.id });
      await request(h.app.getHttpServer())
        .get(paymentPath(f.order.id))
        .auth(token, { type: 'bearer' })
        .expect(404);
      await postPayment(f.order.id, token).expect(404);
      expect(
        await h.prisma.payment.count({ where: { orderId: f.order.id } }),
      ).toBe(0);
    });
    it('replays one completed payment for identical concurrent 25-on-100 requests', async () => {
      const f = await h.fixture();
      const token = h.token(f.tenantId);
      const key = randomUUID();
      h.dispatched.mockClear();
      const results = await Promise.all([
        postPayment(f.order.id, token, key),
        postPayment(f.order.id, token, key),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(results[0].body.data.id).toBe(results[1].body.data.id);
      expect(
        await h.prisma.payment.count({ where: { orderId: f.order.id } }),
      ).toBe(1);
      expect(
        h.dispatched.mock.calls.filter(
          ([event]) => event.eventType === 'payment.received',
        ),
      ).toHaveLength(1);
    });
    it('rejects a changed payload instead of replaying cached success', async () => {
      const f = await h.fixture();
      const token = h.token(f.tenantId);
      const key = randomUUID();
      await postPayment(f.order.id, token, key).expect(201);
      await postPayment(f.order.id, token, key, {
        ...paymentBody,
        amount: 26,
      }).expect(409);
    });
    it('checks current branch access and deletion before cached replay', async () => {
      const f = await h.fixture();
      const actor = randomUUID();
      const key = randomUUID();
      await postPayment(
        f.order.id,
        h.token(f.tenantId, { sub: actor }),
        key,
      ).expect(201);
      await postPayment(
        f.order.id,
        h.token(f.tenantId, { sub: actor, branchId: f.otherBranch.id }),
        key,
      ).expect(404);
      await h.prisma.order.update({
        where: { id: f.order.id },
        data: { deletedAt: new Date() },
      });
      await postPayment(
        f.order.id,
        h.token(f.tenantId, { sub: actor }),
        key,
      ).expect(404);
    });
    it('rejects cross-actor and cross-branch POST /orders cache replay', async () => {
      const f = await h.fixture();
      const user = await h.prisma.user.create({
        data: {
          tenantId: f.tenantId,
          email: `${randomUUID()}@p0.invalid`,
          passwordHash: 'synthetic',
          firstName: 'A',
          lastName: 'B',
        },
      });
      const dto = {
        branchId: f.branch.id,
        clientId: f.client.id,
        vehicleId: f.vehicle.id,
        workPostId: f.post.id,
        scheduledStart: new Date(f.start.getTime() + 3600000).toISOString(),
        serviceIds: [f.service.id],
      };
      const key = randomUUID();
      const create = (body: typeof dto, token: string) =>
        request(h.app.getHttpServer())
          .post('/api/v1/orders')
          .auth(token, { type: 'bearer' })
          .set('idempotency-key', key)
          .send(body);
      await create(
        dto,
        h.token(f.tenantId, { sub: user.id, branchId: f.branch.id }),
      ).expect(201);
      await create(
        { ...dto, branchId: f.otherBranch.id, workPostId: f.otherPost.id },
        h.token(f.tenantId, { branchId: f.otherBranch.id }),
      ).expect(409);
    });
    it('forbids availability for a different scoped branch', async () => {
      const f = await h.fixture();
      await availability(
        f,
        h.token(f.tenantId, { branchId: f.otherBranch.id }),
      ).expect(403);
    });
    it.each([
      { durationMinutes: '30junk' },
      { durationMinutes: '0' },
      { durationMinutes: '-1' },
      { durationMinutes: '1.5' },
      { durationMinutes: '1441' },
      { date: 'invalid' },
      { workPostId: 'invalid' },
      { assignedEmployeeId: 'invalid' },
    ])('validates availability query %j', async (query) => {
      const f = await h.fixture();
      await availability(f, h.token(f.tenantId), query).expect(400);
    });
    it('does not show a same-tenant post from a different branch', async () => {
      const f = await h.fixture();
      const result = await availability(f, h.token(f.tenantId), {
        workPostId: f.otherPost.id,
      }).expect(200);
      expect(result.body.data).toEqual([]);
    });
    it('does not use zero-profile fallback for an explicitly foreign employee', async () => {
      const f = await h.fixture();
      const result = await availability(f, h.token(f.tenantId), {
        assignedEmployeeId: randomUUID(),
      }).expect(200);
      expect(
        result.body.data.every(
          (slot: { available: boolean }) => !slot.available,
        ),
      ).toBe(true);
    });
  },
);
