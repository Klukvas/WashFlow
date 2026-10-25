import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createWorkflowHarness } from './p0-workflow-harness';
import {
  branchCalendarDay,
  branchDayRange,
} from '../src/common/utils/branch-day.util';

const integration =
  process.env.WASHFLOW_REPAIR_TEST_DATABASE_URL !== undefined
    ? describe
    : describe.skip;
integration('P0 branch-local schedule and sales/receipts reports', () => {
  jest.setTimeout(30000);
  let h: Awaited<ReturnType<typeof createWorkflowHarness>>;
  beforeAll(async () => {
    h = await createWorkflowHarness();
  });
  afterAll(async () => {
    if (h) await h.close();
  });
  function get(path: string, token: string, query: Record<string, unknown>) {
    return request(h.app.getHttpServer())
      .get(path)
      .auth(token, { type: 'bearer' })
      .query(query);
  }
  it('returns the full overlapping schedule plus current-day overdue work without contact/payment data', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const day = branchCalendarDay(new Date(), 'UTC');
    const range = branchDayRange(day, 'UTC');
    await h.prisma.order.update({
      where: { id: f.order.id },
      data: { deletedAt: new Date() },
    });
    const create = (
      start: Date,
      end: Date,
      status:
        | 'BOOKED'
        | 'COMPLETED'
        | 'IN_PROGRESS'
        | 'CANCELLED'
        | 'NO_SHOW' = 'BOOKED',
      deletedAt: Date | null = null,
    ) =>
      h.prisma.order.create({
        data: {
          ...f.order,
          id: randomUUID(),
          scheduledStart: start,
          scheduledEnd: end,
          status,
          deletedAt,
        },
      });
    const expected = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        create(
          new Date(range.start.getTime() + i * 1800000),
          new Date(range.start.getTime() + (i + 1) * 1800000),
        ),
      ),
    );
    const previous = await create(
      new Date(range.start.getTime() - 900000),
      new Date(range.start.getTime() + 900000),
    );
    const completed = await create(
      new Date(range.start.getTime() + 3600000),
      new Date(range.start.getTime() + 5400000),
      'COMPLETED',
    );
    const overdue = await create(
      new Date(range.start.getTime() - 2 * 86400000),
      new Date(range.start.getTime() - 86400000),
      'IN_PROGRESS',
    );
    await create(new Date(range.start.getTime() - 3600000), range.start);
    await create(range.end, new Date(range.end.getTime() + 3600000));
    await create(range.start, range.end, 'CANCELLED');
    await create(range.start, range.end, 'NO_SHOW');
    await create(range.start, range.end, 'BOOKED', new Date());
    const response = await get('/api/v1/orders/schedule', token, {
      branchId: f.branch.id,
      date: day,
    }).expect(200);
    expect(
      response.body.data.orders.map((order: { id: string }) => order.id).sort(),
    ).toEqual(
      [...expected, previous, completed, overdue]
        .map((order) => order.id)
        .sort(),
    );
    expect(
      response.body.data.orders.find(
        (order: { id: string }) => order.id === overdue.id,
      ).isOverdue,
    ).toBe(true);
    expect(JSON.stringify(response.body.data)).not.toMatch(
      /clientId|tenantId|payments|email|phone|notes|totalPrice|passwordHash/,
    );
    const tomorrow = new Date(range.end).toISOString().slice(0, 10);
    const future = await get('/api/v1/orders/schedule', token, {
      branchId: f.branch.id,
      date: tomorrow,
    }).expect(200);
    expect(
      future.body.data.orders.some(
        (order: { id: string }) => order.id === overdue.id,
      ),
    ).toBe(false);
  });
  it.each([
    ['2026-03-08', '2026-03-08T05:00:00.000Z', '2026-03-09T04:00:00.000Z'],
    ['2026-11-01', '2026-11-01T04:00:00.000Z', '2026-11-02T05:00:00.000Z'],
  ])('uses both New York local midnights on %s', async (day, start, end) => {
    const f = await h.fixture();
    await h.prisma.branch.update({
      where: { id: f.branch.id },
      data: { timezone: 'America/New_York' },
    });
    const response = await get('/api/v1/orders/schedule', h.token(f.tenantId), {
      branchId: f.branch.id,
      date: day,
    }).expect(200);
    expect(response.body.data).toMatchObject({
      date: day,
      timezone: 'America/New_York',
      range: { start, end },
    });
    const summary = await get(
      '/api/v1/analytics/day-summary',
      h.token(f.tenantId),
      { branchId: f.branch.id, date: day },
    ).expect(200);
    expect(summary.body.data.range).toEqual({ start, end });
  });
  it('separates scheduled-date sales from paid-date receipts, including cancelled/deleted parents and exact decimals', async () => {
    const f = await h.fixture();
    const otherTenant = await h.fixture();
    const day = '2026-03-08';
    const range = branchDayRange(day, 'America/New_York');
    await h.prisma.branch.update({
      where: { id: f.branch.id },
      data: { timezone: 'America/New_York' },
    });
    const order = (
      offset: number,
      totalPrice: string,
      status: 'BOOKED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW' = 'BOOKED',
      deletedAt: Date | null = null,
      branchId = f.branch.id,
    ) =>
      h.prisma.order.create({
        data: {
          ...f.order,
          id: randomUUID(),
          branchId,
          status,
          deletedAt,
          totalPrice,
          scheduledStart: new Date(range.start.getTime() + offset),
          scheduledEnd: new Date(range.start.getTime() + offset + 1800000),
        },
      });
    const booked = await order(0, '0.10');
    const completed = await order(3600000, '0.20', 'COMPLETED');
    const cancelled = await order(7200000, '9.00', 'CANCELLED');
    await order(10800000, '8.00', 'NO_SHOW');
    const deleted = await order(14400000, '7.00', 'BOOKED', new Date());
    const previous = await order(-600000, '3.00');
    const otherBranch = await order(
      0,
      '10.00',
      'BOOKED',
      null,
      f.otherBranch.id,
    );
    const paid = (
      orderId: string,
      amount: string,
      method: 'CASH' | 'CARD' | 'ONLINE',
      createdAt = new Date(range.start.getTime() + 1000),
      status: 'PAID' | 'PENDING' = 'PAID',
    ) =>
      h.prisma.payment.create({
        data: {
          tenantId: f.tenantId,
          orderId,
          amount,
          method,
          status,
          createdAt,
        },
      });
    await paid(booked.id, '50.00', 'CASH', new Date(range.start.getTime() - 1));
    await paid(completed.id, '0.10', 'CASH', range.start);
    await paid(cancelled.id, '0.20', 'CARD');
    await paid(deleted.id, '0.30', 'ONLINE');
    await paid(previous.id, '0.40', 'CARD');
    await paid(booked.id, '1.00', 'CARD', undefined, 'PENDING');
    await paid(booked.id, '10.00', 'CASH', range.end);
    await paid(otherBranch.id, '90.00', 'CASH');
    await paid(otherTenant.order.id, '99.00', 'CASH');
    const response = await get(
      '/api/v1/analytics/day-summary',
      h.token(f.tenantId),
      { branchId: f.branch.id, date: day },
    ).expect(200);
    expect(response.body.data.sales).toMatchObject({
      orderCount: 4,
      completedCount: 1,
      scheduledTotal: '0.30',
      completedTotal: '0.20',
    });
    expect(response.body.data.sales.byStatus).toEqual(
      expect.arrayContaining([
        { status: 'BOOKED', count: 1, total: '0.10' },
        { status: 'COMPLETED', count: 1, total: '0.20' },
        { status: 'CANCELLED', count: 1, total: '9.00' },
        { status: 'NO_SHOW', count: 1, total: '8.00' },
      ]),
    );
    expect(response.body.data.receipts).toEqual({
      count: 4,
      total: '1.00',
      byMethod: expect.arrayContaining([
        { method: 'CASH', count: 1, total: '0.10' },
        { method: 'CARD', count: 2, total: '0.60' },
        { method: 'ONLINE', count: 1, total: '0.30' },
      ]),
    });
  });
  it('enforces permissions, explicit/effective single-branch scope, exact dates and empty totals', async () => {
    const f = await h.fixture();
    const token = h.token(f.tenantId);
    const day = '2026-03-08';
    for (const path of [
      '/api/v1/orders/schedule',
      '/api/v1/analytics/day-summary',
    ]) {
      await get(path, h.token(f.tenantId, { permissions: [] }), {
        branchId: f.branch.id,
        date: day,
      }).expect(403);
      await get(path, h.token(randomUUID()), {
        branchId: f.branch.id,
        date: day,
      }).expect(404);
      await get(path, h.token(f.tenantId, { branchId: f.otherBranch.id }), {
        branchId: f.branch.id,
        date: day,
      }).expect(403);
      for (const date of ['2026-02-30', '2026-03-08T00:00:00Z', '2026-3-08'])
        await get(path, token, { branchId: f.branch.id, date }).expect(400);
    }
    await get('/api/v1/analytics/day-summary', token, { date: day }).expect(
      400,
    );
    const result = await get(
      '/api/v1/analytics/day-summary',
      h.token(f.tenantId, { branchId: f.branch.id }),
      { date: day },
    ).expect(200);
    expect(result.body.data).toMatchObject({
      branchId: f.branch.id,
      sales: {
        orderCount: 0,
        completedCount: 0,
        scheduledTotal: '0.00',
        completedTotal: '0.00',
        byStatus: [],
      },
      receipts: { count: 0, total: '0.00', byMethod: [] },
    });
  });
});
