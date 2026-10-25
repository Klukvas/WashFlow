import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import { createWorkflowHarness } from './p0-workflow-harness';

const integration =
  process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL !== undefined
    ? describe
    : describe.skip;
integration(
  'P0 reschedule PostgreSQL races through guarded controllers',
  () => {
    jest.setTimeout(30000);
    let h: Awaited<ReturnType<typeof createWorkflowHarness>>;
    beforeAll(async () => {
      h = await createWorkflowHarness();
    });
    afterAll(async () => {
      if (h) await h.close();
    });
    async function fixture() {
      const f = await h.fixture();
      const actor = await h.prisma.user.create({
        data: {
          tenantId: f.tenantId,
          email: `${randomUUID()}@workflow.invalid`,
          passwordHash: 'synthetic-unused',
          firstName: 'Operator',
          lastName: 'Fixture',
        },
      });
      const payment = await h.prisma.payment.create({
        data: {
          tenantId: f.tenantId,
          orderId: f.order.id,
          amount: '10.10',
          method: 'CASH',
          status: 'PAID',
        },
      });
      return {
        ...f,
        token: h.token(f.tenantId, { sub: actor.id }),
        payment,
        target: new Date(f.start.getTime() + 2 * 3600000),
      };
    }
    type Fixture = Awaited<ReturnType<typeof fixture>>;
    const move = (f: Fixture, id = f.order.id) =>
      request(h.app.getHttpServer())
        .patch(`/api/v1/orders/${id}/reschedule`)
        .auth(f.token, { type: 'bearer' })
        .send({ scheduledStart: f.target.toISOString() });
    async function contend(
      lock: (tx: Prisma.TransactionClient) => Promise<unknown>,
      operations: readonly [() => request.Test, () => request.Test],
    ) {
      let ready: () => void = () => undefined;
      let release: () => void = () => undefined;
      const locked = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const unlocked = new Promise<void>((resolve) => {
        release = resolve;
      });
      const holder = h.prisma.$transaction(
        async (tx) => {
          await lock(tx);
          ready();
          await unlocked;
        },
        { timeout: 15000 },
      );
      await Promise.race([locked, holder]);
      const results = Promise.all(
        operations.map((operation) => Promise.resolve(operation())),
      );
      try {
        let waiting = 0;
        const deadline = Date.now() + 8000;
        while (waiting < 2 && Date.now() < deadline) {
          const [row] = await h.prisma.$queryRaw<
            { count: number }[]
          >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
          waiting = row.count;
          if (waiting < 2)
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBeGreaterThanOrEqual(2);
      } finally {
        release();
        await holder;
      }
      return results;
    }
    async function assertMoneyPreserved(f: Fixture) {
      const current = await h.prisma.order.findUniqueOrThrow({
        where: { id: f.order.id },
      });
      expect(current.totalPrice?.toFixed(2)).toBe('100.00');
      expect(
        current.scheduledEnd.getTime() - current.scheduledStart.getTime(),
      ).toBe(1800000);
      expect(
        await h.prisma.payment.findUnique({ where: { id: f.payment.id } }),
      ).toEqual(f.payment);
      return current;
    }
    async function assertOneTarget(f: Fixture) {
      const rows = await h.prisma.order.findMany({
        where: {
          tenantId: f.tenantId,
          branchId: f.branch.id,
          workPostId: f.post.id,
          deletedAt: null,
          status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
          scheduledStart: { lt: new Date(f.target.getTime() + 1800000) },
          scheduledEnd: { gt: f.target },
        },
      });
      expect(rows).toHaveLength(1);
      await assertMoneyPreserved(f);
    }
    it.each(['create', 'restore', 'reschedule'] as const)(
      'reschedule versus %s reserves the target slot once',
      async (kind) => {
        const f = await fixture();
        const other =
          kind === 'create'
            ? null
            : await h.prisma.order.create({
                data: {
                  ...f.order,
                  id: randomUUID(),
                  scheduledStart:
                    kind === 'restore'
                      ? f.target
                      : new Date(f.start.getTime() + 3600000),
                  scheduledEnd: new Date(
                    (kind === 'restore'
                      ? f.target.getTime()
                      : f.start.getTime() + 3600000) + 1800000,
                  ),
                  deletedAt: kind === 'restore' ? new Date() : null,
                },
              });
        const competitor = () => {
          if (kind === 'create')
            return request(h.app.getHttpServer())
              .post('/api/v1/orders')
              .auth(f.token, { type: 'bearer' })
              .send({
                branchId: f.branch.id,
                clientId: f.client.id,
                vehicleId: f.vehicle.id,
                workPostId: f.post.id,
                scheduledStart: f.target.toISOString(),
                serviceIds: [f.service.id],
              });
          if (!other) throw new Error('Missing synthetic competitor');
          if (kind === 'reschedule') return move(f, other.id);
          return request(h.app.getHttpServer())
            .patch(`/api/v1/orders/${other.id}/restore`)
            .auth(f.token, { type: 'bearer' })
            .send();
        };
        const results = await contend(
          (tx) =>
            tx.$queryRaw`SELECT id FROM work_posts WHERE id = ${f.post.id} AND "tenantId" = ${f.tenantId} FOR UPDATE`,
          [() => move(f), competitor],
        );
        expect(
          results.filter((result) => [200, 201].includes(result.status)),
        ).toHaveLength(1);
        expect(results.filter((result) => result.status === 409)).toHaveLength(
          1,
        );
        await assertOneTarget(f);
      },
    );
    it('reschedule versus status rechecks the serialized current state', async () => {
      const f = await fixture();
      const results = await contend(
        (tx) =>
          tx.$queryRaw`SELECT id FROM orders WHERE id = ${f.order.id} AND "tenantId" = ${f.tenantId} FOR UPDATE`,
        [
          () => move(f),
          () =>
            request(h.app.getHttpServer())
              .patch(`/api/v1/orders/${f.order.id}/status`)
              .auth(f.token, { type: 'bearer' })
              .send({ status: 'IN_PROGRESS' }),
        ],
      );
      expect(results[1].status).toBe(200);
      expect([200, 400, 409]).toContain(results[0].status);
      const current = await assertMoneyPreserved(f);
      expect(current.status).toBe('IN_PROGRESS');
      if (results[0].status === 200)
        expect(current.scheduledStart).toEqual(f.target);
      else expect(current.scheduledStart).toEqual(f.start);
    });
    it('reschedule versus payment preserves cap, existing receipt and booking duration', async () => {
      const f = await fixture();
      const results = await contend(
        (tx) =>
          tx.$queryRaw`SELECT id FROM orders WHERE id = ${f.order.id} AND "tenantId" = ${f.tenantId} FOR UPDATE`,
        [
          () => move(f),
          () =>
            request(h.app.getHttpServer())
              .post(`/api/v1/orders/${f.order.id}/payments`)
              .auth(f.token, { type: 'bearer' })
              .set('idempotency-key', randomUUID())
              .send({ amount: 25.2, method: 'CARD' }),
        ],
      );
      expect(results.map((result) => result.status)).toEqual([200, 201]);
      await assertMoneyPreserved(f);
      const paid = await h.prisma.payment.aggregate({
        where: { tenantId: f.tenantId, orderId: f.order.id },
        _sum: { amount: true },
        _count: { _all: true },
      });
      expect(paid._sum.amount?.toFixed(2)).toBe('35.30');
      expect(paid._count._all).toBe(2);
    });
    it.each(['reschedule', 'status'] as const)(
      '%s versus deletion never mutates a row after it is deleted',
      async (kind) => {
        const f = await fixture();
        const mutation = () =>
          kind === 'reschedule'
            ? move(f)
            : request(h.app.getHttpServer())
                .patch(`/api/v1/orders/${f.order.id}/status`)
                .auth(f.token, { type: 'bearer' })
                .send({ status: 'IN_PROGRESS' });
        const results = await contend(
          (tx) =>
            tx.$queryRaw`SELECT id FROM orders WHERE id = ${f.order.id} AND "tenantId" = ${f.tenantId} FOR UPDATE`,
          [
            mutation,
            () =>
              request(h.app.getHttpServer())
                .delete(`/api/v1/orders/${f.order.id}`)
                .auth(f.token, { type: 'bearer' }),
          ],
        );
        expect(results[1].status).toBe(200);
        expect([200, 404, 409]).toContain(results[0].status);
        const current = await assertMoneyPreserved(f);
        expect(current.deletedAt).not.toBeNull();
        if (results[0].status !== 200) {
          expect(current.status).toBe('BOOKED');
          expect(current.scheduledStart).toEqual(f.start);
        }
        const after =
          kind === 'reschedule'
            ? await move(f)
            : await request(h.app.getHttpServer())
                .patch(`/api/v1/orders/${f.order.id}/status`)
                .auth(f.token, { type: 'bearer' })
                .send({ status: 'IN_PROGRESS' });
        expect(after.status).toBe(404);
      },
    );
  },
);
