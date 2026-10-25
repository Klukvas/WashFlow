import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createWorkflowHarness } from './p0-workflow-harness';

const integration =
  process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL !== undefined
    ? describe
    : describe.skip;
integration('P0 workflow HTTP contracts and reschedule invariants', () => {
  jest.setTimeout(30000);
  let h: Awaited<ReturnType<typeof createWorkflowHarness>>;
  beforeAll(async () => {
    h = await createWorkflowHarness();
  });
  afterAll(async () => {
    if (h) await h.close();
  });
  const reschedulePath = (id: string) => `/api/v1/orders/${id}/reschedule`;
  function move(id: string, token: string, payload: Record<string, unknown>) {
    return request(h.app.getHttpServer())
      .patch(reschedulePath(id))
      .auth(token, { type: 'bearer' })
      .send(payload);
  }
  async function employee(
    f: Awaited<ReturnType<typeof h.fixture>>,
    branchId = f.branch.id,
  ) {
    const user = await h.prisma.user.create({
      data: {
        tenantId: f.tenantId,
        email: `${randomUUID()}@workflow.invalid`,
        passwordHash: 'synthetic-unused',
        firstName: 'Worker',
        lastName: 'Fixture',
      },
    });
    return h.prisma.employeeProfile.create({
      data: {
        tenantId: f.tenantId,
        branchId,
        userId: user.id,
        workStartTime: '00:00',
        workEndTime: '23:59',
      },
    });
  }
  it('reschedules overlapping itself while preserving stored duration, snapshots, prices, status and payments', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const worker = await employee(f);
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: {
        assignedEmployeeId: worker.id,
        status: 'BOOKED_PENDING_CONFIRMATION',
      },
    });
    await h.prisma.orderService.create({
      data: {
        tenantId: f.tenantId,
        orderId: f.order.id,
        serviceId: f.service.id,
        price: '42.10',
        quantity: 2,
      },
    });
    await h.prisma.payment.create({
      data: {
        tenantId: f.tenantId,
        orderId: f.order.id,
        amount: '25.20',
        method: 'CARD',
        status: 'PAID',
      },
    });
    await h.prisma.service.update({
      where: { id: f.service.id },
      data: { price: 999, durationMin: 90 },
    });
    const before = await h.prisma.order.findUniqueOrThrow({
      where: { id: f.order.id },
      include: { services: true, payments: true },
    });
    const scheduledStart = new Date(
      f.start.getTime() + 5 * 60000,
    ).toISOString();
    h.dispatched.mockClear();
    const result = await move(f.order.id, token, { scheduledStart }).expect(
      200,
    );
    expect(result.body.data).toMatchObject({
      id: f.order.id,
      scheduledStart,
      branchId: f.branch.id,
      workPostId: f.post.id,
      assignedEmployeeId: worker.id,
      status: 'BOOKED_PENDING_CONFIRMATION',
      totalPrice: '100',
    });
    expect(
      new Date(result.body.data.scheduledEnd).getTime() -
        Date.parse(scheduledStart),
    ).toBe(1800000);
    expect(result.body.data.client.id).toBe(f.client.id);
    const after = await h.prisma.order.findUniqueOrThrow({
      where: { id: f.order.id },
      include: { services: true, payments: true },
    });
    expect(after.services).toEqual(before.services);
    expect(after.payments).toEqual(before.payments);
    expect(h.dispatched.mock.calls.map(([event]) => event.eventType)).toEqual([
      'order.rescheduled',
    ]);
    await move(f.order.id, token, { scheduledStart }).expect(200);
    expect(h.dispatched).toHaveBeenCalledTimes(1);
  });
  it('validates current tenant/branch/permission access and rejects malformed mutation fields', async () => {
    const f = await h.fixture();
    const scheduledStart = new Date(f.start.getTime() + 3600000).toISOString();
    await request(h.app.getHttpServer())
      .patch(reschedulePath(f.order.id))
      .send({ scheduledStart })
      .expect(401);
    await move(f.order.id, h.token(f.tenantId, { permissions: [] }), {
      scheduledStart,
    }).expect(403);
    await move(f.order.id, h.token(randomUUID()), { scheduledStart }).expect(
      404,
    );
    await move(
      f.order.id,
      h.token(f.tenantId, { branchId: f.otherBranch.id }),
      { scheduledStart },
    ).expect(404);
    for (const invalid of [
      { scheduledStart: '2026-11-02T12:00:00' },
      { scheduledStart, workPostId: null },
      { scheduledStart, assignedEmployeeId: null },
      { scheduledStart, branchId: f.otherBranch.id },
      { scheduledStart, totalPrice: 1 },
      { scheduledStart, workPostId: 'bad' },
    ])
      await move(f.order.id, h.token(f.tenantId), invalid).expect(400);
    await move(f.order.id, h.token(f.tenantId), {
      scheduledStart,
      workPostId: f.otherPost.id,
    }).expect(400);
    const foreignWorker = await employee(f, f.otherBranch.id);
    await move(f.order.id, h.token(f.tenantId), {
      scheduledStart,
      assignedEmployeeId: foreignWorker.id,
    }).expect(400);
  });
  it.each(['IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
    'rejects rescheduling %s without changing money or time',
    async (status) => {
      const f = await h.fixture();
      await h.prisma.order.update({
        where: { id: f.order.id },
        data: { status },
      });
      await move(f.order.id, h.token(f.tenantId), {
        scheduledStart: new Date(f.start.getTime() + 3600000).toISOString(),
      }).expect(400);
      const after = await h.prisma.order.findUniqueOrThrow({
        where: { id: f.order.id },
      });
      expect(after.scheduledStart).toEqual(f.start);
      expect(after.totalPrice?.toFixed(2)).toBe('100.00');
    },
  );
  it('rejects reschedule/status mutations of a soft-deleted row', async () => {
    const f = await h.fixture();
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: { deletedAt: new Date() },
    });
    const token = h.token(f.tenantId);
    await move(f.order.id, token, {
      scheduledStart: new Date(f.start.getTime() + 3600000).toISOString(),
    }).expect(404);
    await request(h.app.getHttpServer())
      .patch(`/api/v1/orders/${f.order.id}/status`)
      .auth(token, { type: 'bearer' })
      .send({ status: 'IN_PROGRESS' })
      .expect(404);
    expect(
      (await h.prisma.order.findUniqueOrThrow({ where: { id: f.order.id } }))
        .status,
    ).toBe('BOOKED');
  });
  it('preserves legacy unassigned resources when omitted', async () => {
    const f = await h.fixture();
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: { workPostId: null, assignedEmployeeId: null },
    });
    const result = await move(f.order.id, h.token(f.tenantId), {
      scheduledStart: new Date(f.start.getTime() + 3600000).toISOString(),
    }).expect(200);
    expect(result.body.data).toMatchObject({
      workPostId: null,
      assignedEmployeeId: null,
    });
  });
  it('authorizes availability exclusion before ignoring an order in post and employee conflicts', async () => {
    const f = await h.fixture();
    const worker = await employee(f);
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: { assignedEmployeeId: worker.id },
    });
    const query = {
      branchId: f.branch.id,
      date: f.start.toISOString().slice(0, 10),
      workPostId: f.post.id,
      assignedEmployeeId: worker.id,
      durationMinutes: 30,
    };
    const get = (token: string, excludeOrderId?: string) =>
      request(h.app.getHttpServer())
        .get('/api/v1/orders/availability')
        .auth(token, { type: 'bearer' })
        .query({ ...query, ...(excludeOrderId ? { excludeOrderId } : {}) });
    const before = await get(h.token(f.tenantId)).expect(200);
    const after = await get(h.token(f.tenantId), f.order.id).expect(200);
    expect(
      before.body.data.find(
        (slot: { start: string }) => slot.start === f.start.toISOString(),
      ).available,
    ).toBe(false);
    expect(
      after.body.data.find(
        (slot: { start: string }) => slot.start === f.start.toISOString(),
      ).available,
    ).toBe(true);
    await get(h.token(randomUUID()), f.order.id).expect(404);
    const other = await h.prisma.order.create({
      data: {
        ...f.order,
        id: randomUUID(),
        branchId: f.otherBranch.id,
        workPostId: f.otherPost.id,
      },
    });
    await get(h.token(f.tenantId), other.id).expect(403);
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: { deletedAt: new Date() },
    });
    await get(h.token(f.tenantId), f.order.id).expect(404);
  });
  it('uses the branch-local weekday for create, reschedule and date-label availability in negative offsets', async () => {
    const f = await h.fixture();
    await h.prisma.branch.update({
      where: { id: f.branch.id },
      data: { timezone: 'America/Los_Angeles' },
    });
    await h.prisma.bookingSettings.updateMany({
      where: { tenantId: f.tenantId, branchId: f.branch.id },
      data: { workingDays: [1], maxAdvanceBookingDays: 365 },
    });
    const localMonday = new Date();
    localMonday.setUTCDate(localMonday.getUTCDate() + 8);
    while (localMonday.getUTCDay() !== 1)
      localMonday.setUTCDate(localMonday.getUTCDate() + 1);
    const day = localMonday.toISOString().slice(0, 10);
    const tuesdayUTC = new Date(`${day}T00:00:00Z`);
    tuesdayUTC.setUTCDate(tuesdayUTC.getUTCDate() + 1);
    tuesdayUTC.setUTCHours(2);
    const actor = await h.prisma.user.create({
      data: {
        tenantId: f.tenantId,
        email: `${randomUUID()}@workflow.invalid`,
        passwordHash: 'synthetic-unused',
        firstName: 'Operator',
        lastName: 'Fixture',
      },
    });
    const token = h.token(f.tenantId, { sub: actor.id });
    const scheduledStart = tuesdayUTC.toISOString();
    const created = await request(h.app.getHttpServer())
      .post('/api/v1/orders')
      .auth(token, { type: 'bearer' })
      .send({
        branchId: f.branch.id,
        clientId: f.client.id,
        vehicleId: f.vehicle.id,
        workPostId: f.post.id,
        scheduledStart,
        serviceIds: [f.service.id],
      })
      .expect(201);
    await move(created.body.data.id, token, {
      scheduledStart: new Date(tuesdayUTC.getTime() + 3600000).toISOString(),
    }).expect(200);
    const availability = await request(h.app.getHttpServer())
      .get('/api/v1/orders/availability')
      .auth(token, { type: 'bearer' })
      .query({ branchId: f.branch.id, date: day })
      .expect(200);
    expect(availability.body.data.length).toBeGreaterThan(0);
  });
});
