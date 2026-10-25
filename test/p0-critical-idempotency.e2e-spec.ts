import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createP0Harness } from './p0-critical-harness';

const integration =
  process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL !== undefined
    ? describe
    : describe.skip;
integration('P0 request identity and HTTP auth boundaries', () => {
  let h: Awaited<ReturnType<typeof createP0Harness>>;
  beforeAll(async () => {
    h = await createP0Harness();
  });
  afterAll(async () => {
    if (h) await h.close();
  });
  const body = { amount: 25, method: 'CASH' };
  const path = (id: string) => `/api/v1/orders/${id}/payments`;
  function pay(
    id: string,
    token: string,
    key = randomUUID(),
    payload: Record<string, unknown> = body,
  ) {
    return request(h.app.getHttpServer())
      .post(path(id))
      .auth(token, { type: 'bearer' })
      .set('idempotency-key', key)
      .send(payload);
  }
  async function orderFixture() {
    const f = await h.fixture();
    const user = await h.prisma.user.create({
      data: {
        tenantId: f.tenantId,
        email: `${randomUUID()}@p0.invalid`,
        passwordHash: 'synthetic-unused',
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
    return { ...f, user, dto, token: h.token(f.tenantId, { sub: user.id }) };
  }
  function createOrder(
    dto: Record<string, unknown>,
    token: string,
    key = randomUUID(),
  ) {
    return request(h.app.getHttpServer())
      .post('/api/v1/orders')
      .auth(token, { type: 'bearer' })
      .set('idempotency-key', key)
      .send(dto);
  }
  it('runs real HTTP guards: missing/invalid bearer401, no permissions403, foreign tenant404', async () => {
    const f = await h.fixture();
    await request(h.app.getHttpServer()).get(path(f.order.id)).expect(401);
    await request(h.app.getHttpServer())
      .get(path(f.order.id))
      .auth('invalid', { type: 'bearer' })
      .expect(401);
    const denied = h.token(f.tenantId, { permissions: [] });
    await request(h.app.getHttpServer())
      .get(path(f.order.id))
      .auth(denied, { type: 'bearer' })
      .expect(403);
    await pay(f.order.id, denied).expect(403);
    await request(h.app.getHttpServer())
      .get('/api/v1/orders/availability')
      .auth(denied, { type: 'bearer' })
      .query({ branchId: f.branch.id, date: '2026-10-26' })
      .expect(403);
    await request(h.app.getHttpServer())
      .get(path(f.order.id))
      .auth(h.token(randomUUID()), { type: 'bearer' })
      .expect(404);
    await pay(f.order.id, h.token(randomUUID())).expect(404);
    await request(h.app.getHttpServer())
      .get('/api/v1/orders/availability')
      .auth(h.token(randomUUID()), { type: 'bearer' })
      .query({ branchId: f.branch.id, date: f.start.toISOString() })
      .expect(404);
    expect(
      await h.prisma.payment.count({ where: { orderId: f.order.id } }),
    ).toBe(0);
  });
  it.each(['', 'bad key', 'x'.repeat(129)])(
    'rejects malformed idempotency header %j',
    async (key) => {
      const f = await h.fixture();
      await pay(f.order.id, h.token(f.tenantId), key).expect(400);
    },
  );
  it.each([
    { method: 'CARD' },
    { status: 'PENDING' },
    { reference: 'changed' },
  ])('binds payment identity to %j', async (change) => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const key = randomUUID();
    await pay(f.order.id, token, key).expect(201);
    await pay(f.order.id, token, key, { ...body, ...change }).expect(409);
    expect(
      await h.prisma.payment.count({ where: { orderId: f.order.id } }),
    ).toBe(1);
  });
  it('binds payment key to actor and canonical order path', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const key = randomUUID();
    const other = await h.prisma.order.create({
      data: {
        ...f.order,
        id: randomUUID(),
        branchId: f.otherBranch.id,
        workPostId: f.otherPost.id,
      },
    });
    await pay(f.order.id, token, key).expect(201);
    await pay(f.order.id, h.token(f.tenantId), key).expect(409);
    await pay(other.id, token, key).expect(409);
    await h.prisma.idempotencyKey.update({
      where: { tenantId_key: { tenantId: f.tenantId, key } },
      data: { method: 'PATCH' },
    });
    await pay(f.order.id, token, key).expect(409);
  });
  it('rereads a cross-order key winner after a concurrent failed claim', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const key = randomUUID();
    const other = await h.prisma.order.create({
      data: {
        ...f.order,
        id: randomUUID(),
        branchId: f.otherBranch.id,
        workPostId: f.otherPost.id,
      },
    });
    const results = await Promise.all([
      pay(f.order.id, token, key),
      pay(other.id, token, key),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(
      await h.prisma.payment.count({ where: { tenantId: f.tenantId } }),
    ).toBe(1);
  });
  it('replays equivalent amount/default status after completion without events', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const key = randomUUID();
    const initial = await pay(f.order.id, token, key, {
      ...body,
      amount: '25.00',
    }).expect(201);
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: { status: 'COMPLETED' },
    });
    h.dispatched.mockClear();
    const replay = await pay(f.order.id, token, key, {
      ...body,
      status: 'PAID',
    });
    expect({ status: replay.status, body: replay.body }).toMatchObject({
      status: 201,
      body: { data: initial.body.data },
    });
    expect(replay.body.data).toEqual(initial.body.data);
    expect(replay.body.meta.timestamp).toEqual(expect.any(String));
    expect(h.dispatched).not.toHaveBeenCalled();
  });
  it('allows different keys for ordinary partial payments and preserves PENDING cap reservation', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const responses = await Promise.all([
      pay(f.order.id, token),
      pay(f.order.id, token),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses[0].body.data.id).not.toBe(responses[1].body.data.id);
    await pay(f.order.id, token, randomUUID(), {
      ...body,
      amount: 50,
      status: 'PENDING',
    }).expect(201);
    await pay(f.order.id, token, randomUUID(), { ...body, amount: 1 }).expect(
      400,
    );
    expect(
      await h.prisma.payment.count({ where: { orderId: f.order.id } }),
    ).toBe(3);
  });
  it('atomically reuses an expired key for one of two concurrent identical requests', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const key = randomUUID();
    await h.prisma.idempotencyKey.create({
      data: {
        tenantId: f.tenantId,
        key,
        method: 'POST',
        path: '/legacy',
        statusCode: 201,
        responseBody: { id: 'legacy' },
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const results = await Promise.all([
      pay(f.order.id, token, key),
      pay(f.order.id, token, key),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect(
      await h.prisma.payment.count({ where: { orderId: f.order.id } }),
    ).toBe(1);
  });
  it('fails closed for a live unversioned payment key', async () => {
    const f = await h.fixture();
    const key = randomUUID();
    await h.prisma.idempotencyKey.create({
      data: {
        tenantId: f.tenantId,
        key,
        method: 'POST',
        path: path(f.order.id),
        statusCode: 201,
        responseBody: { id: 'legacy' },
        expiresAt: new Date(Date.now() + 86400000),
      },
    });
    await pay(f.order.id, h.token(f.tenantId), key).expect(409);
  });
  it('rolls back both payment and key on result-save failure, then safely retries', async () => {
    const f = await h.fixture();
    const key = randomUUID();
    const token = h.token(f.tenantId);
    h.dispatched.mockClear();
    const save = jest
      .spyOn(h.idempotency, 'saveRequestTx')
      .mockRejectedValueOnce(new Error('synthetic save failure'));
    await pay(f.order.id, token, key).expect(500);
    expect(
      await h.prisma.payment.count({ where: { orderId: f.order.id } }),
    ).toBe(0);
    expect(
      await h.prisma.idempotencyKey.count({
        where: { tenantId: f.tenantId, key },
      }),
    ).toBe(0);
    expect(h.dispatched).not.toHaveBeenCalled();
    save.mockRestore();
    await pay(f.order.id, token, key).expect(201);
  });
  it('rejects key reuse in both directions between order and payment routes', async () => {
    const f = await orderFixture();
    const key = randomUUID();
    await pay(f.order.id, f.token, key).expect(201);
    await createOrder(f.dto, f.token, key).expect(409);
    const orderKey = randomUUID();
    await createOrder(f.dto, f.token, orderKey).expect(201);
    await pay(f.order.id, f.token, orderKey).expect(409);
  });
  it('replays one order/event concurrently and survives changed dynamic booking conditions', async () => {
    const f = await orderFixture();
    const key = randomUUID();
    h.dispatched.mockClear();
    const results = await Promise.all([
      createOrder(f.dto, f.token, key),
      createOrder(f.dto, f.token, key),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201]);
    expect(results[0].body.data.id).toBe(results[1].body.data.id);
    expect(
      await h.prisma.order.count({ where: { tenantId: f.tenantId } }),
    ).toBe(2);
    expect(
      h.dispatched.mock.calls.filter(
        ([event]) => event.eventType === 'order.created',
      ),
    ).toHaveLength(1);
    await h.prisma.service.update({
      where: { id: f.service.id },
      data: { isActive: false, price: 999 },
    });
    await h.prisma.bookingSettings.updateMany({
      where: { tenantId: f.tenantId },
      data: { workingDays: [] },
    });
    await createOrder({ ...f.dto, source: 'INTERNAL' }, f.token, key).expect(
      201,
    );
    await createOrder({ ...f.dto, notes: 'changed' }, f.token, key).expect(409);
    await createOrder(f.dto, h.token(f.tenantId), key).expect(409);
    await h.prisma.order.update({
      where: { id: results[0].body.data.id },
      data: { deletedAt: new Date() },
    });
    await createOrder(f.dto, f.token, key).expect(404);
  });
  it('replays explicit-post anonymous booking before availability and CRM resolution', async () => {
    const f = await h.fixture();
    const key = randomUUID();
    const booking = {
      branchId: f.branch.id,
      workPostId: f.post.id,
      scheduledStart: new Date(f.start.getTime() + 3600000).toISOString(),
      serviceIds: [f.service.id],
      firstName: 'Submitted',
      phone: '+15551239876',
      licensePlate: 'SYNTHETIC-EXPLICIT',
    };
    const book = () =>
      request(h.app.getHttpServer())
        .post('/api/v1/public/widget/book')
        .set('x-carwash-tenant-id', f.tenantId)
        .set('idempotency-key', key)
        .send(booking);
    const initial = await book().expect(201);
    const countRecords = async () =>
      Promise.all([
        h.prisma.client.count({ where: { tenantId: f.tenantId } }),
        h.prisma.vehicle.count({ where: { tenantId: f.tenantId } }),
        h.prisma.order.count({ where: { tenantId: f.tenantId } }),
      ]);
    const counts = await countRecords();
    h.dispatched.mockClear();
    await book().expect(201);
    const created = await h.prisma.order.findUniqueOrThrow({
      where: { id: initial.body.data.id },
    });
    await h.prisma.client.update({
      where: { id: created.clientId },
      data: { deletedAt: new Date() },
    });
    const replay = await book().expect(201);
    expect(initial.body.data.id).toBe(replay.body.data.id);
    await request(h.app.getHttpServer())
      .post('/api/v1/public/widget/book')
      .set('x-carwash-tenant-id', f.tenantId)
      .set('idempotency-key', key)
      .send({ ...booking, phone: '+15550000000' })
      .expect(409);
    expect(await countRecords()).toEqual(counts);
    expect(h.dispatched).not.toHaveBeenCalled();
    const tenant = await h.prisma.tenant.findUniqueOrThrow({
      where: { id: f.tenantId },
    });
    await request(h.app.getHttpServer())
      .post(`/api/v1/public/booking/${tenant.slug}/book`)
      .set('idempotency-key', key)
      .send(booking)
      .expect(201);
    await h.prisma.branch.update({
      where: { id: f.branch.id },
      data: { isActive: false },
    });
    await book().expect(404);
  });
  it('keeps anonymous booking replay behind the public confirmation projection', async () => {
    const f = await h.fixture();
    const key = randomUUID();
    const booking = {
      branchId: f.branch.id,
      scheduledStart: new Date(f.start.getTime() + 3600000).toISOString(),
      serviceIds: [f.service.id],
      firstName: 'Submitted',
      phone: '+15551234567',
      licensePlate: 'SYNTHETIC',
    };
    const book = () =>
      request(h.app.getHttpServer())
        .post('/api/v1/public/widget/book')
        .set('x-carwash-tenant-id', f.tenantId)
        .set('idempotency-key', key)
        .send(booking);
    const initial = await book().expect(201);
    const replay = await book().expect(201);
    expect(initial.body.data.id).toBe(replay.body.data.id);
    expect(replay.body.data.client).toEqual({
      firstName: booking.firstName,
      lastName: null,
      phone: booking.phone,
    });
    expect(JSON.stringify(replay.body.data)).not.toMatch(
      /passwordHash|createdById|tenantId|clientId|vehicleId/,
    );
  });
});
