import { IdempotencyService } from '../idempotency/idempotency.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const tenantId = 'tenant-1';
const orderId = 'order-1';
const dto = { amount: 75, method: PaymentMethod.CASH };
type StoredPayment = {
  id: string;
  tenantId: string;
  orderId: string;
  amount: number;
};

// Deterministic transaction double: reads see committed rows, inserts commit together,
// and FOR UPDATE holds the order mutex until commit/rollback. No PostgreSQL is used.
function createHarness(
  options: {
    status?: OrderStatus;
    deleted?: boolean;
    failCommit?: boolean;
  } = {},
) {
  let payments: StoredPayment[] = [];
  let lock = Promise.resolve();
  const dispatch = jest.fn();
  const order = {
    id: orderId,
    tenantId,
    status: options.status ?? OrderStatus.BOOKED,
    totalPrice: new Prisma.Decimal(100),
    deletedAt: options.deleted ? new Date() : null,
  };
  const findOrder = (requestedTenant: string) =>
    requestedTenant === tenantId && !order.deletedAt ? { ...order } : null;
  const createPayment = (data: Record<string, unknown>): StoredPayment => ({
    id: `payment-${payments.length + 1}`,
    tenantId: String(data.tenantId),
    orderId: String(data.orderId),
    amount: Number(data.amount),
  });
  const forTenant = jest.fn((requestedTenant: string) => ({
    order: { findFirst: jest.fn(async () => findOrder(requestedTenant)) },
    payment: {
      findMany: jest.fn(async () =>
        [...payments].filter((p) => p.tenantId === requestedTenant),
      ),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const payment = createPayment({ ...data, tenantId: requestedTenant });
        payments = [...payments, payment];
        return payment;
      }),
    },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      let release: (() => void) | undefined;
      let pending: StoredPayment[] = [];
      const tx = {
        $queryRaw: async (
          strings: TemplateStringsArray,
          ...values: unknown[]
        ) => {
          expect(strings.join('?')).toMatch(/FOR UPDATE/);
          expect(strings.join('?')).toContain('"deletedAt" IS NULL');
          expect(strings.join('?')).toContain(
            'WHERE id = ? AND "tenantId" = ?',
          );
          expect(values).toEqual([orderId, requestedTenant]);
          const previousLock = lock;
          lock = new Promise<void>((resolve) => {
            release = resolve;
          });
          await previousLock;
          const found = findOrder(requestedTenant);
          return found ? [found] : [];
        },
        payment: {
          findMany: jest.fn(
            async ({
              where,
            }: {
              where: { tenantId: string; orderId: string };
            }) => {
              expect(where).toEqual({ tenantId: requestedTenant, orderId });
              return [...payments, ...pending].filter(
                (p) =>
                  p.tenantId === where.tenantId && p.orderId === where.orderId,
              );
            },
          ),
          create: jest.fn(
            async ({ data }: { data: Record<string, unknown> }) => {
              expect(data.tenantId).toBe(requestedTenant);
              const payment = createPayment(data);
              pending = [...pending, payment];
              return payment;
            },
          ),
        },
      };
      try {
        const result = await callback(tx);
        if (options.failCommit) throw new Error('Commit failed');
        payments = [...payments, ...pending];
        return result;
      } finally {
        release?.();
      }
    },
  }));
  const tenantPrisma = { forTenant } as unknown as TenantPrismaService;
  const repo = new PaymentsRepository(tenantPrisma);
  const dispatcher = { dispatch } as unknown as EventDispatcherService;
  const service = new PaymentsService(repo, tenantPrisma, dispatcher, {
    requestIdentity: () => undefined,
  } as unknown as IdempotencyService);
  return { service, dispatch, getPayments: () => payments };
}

describe('Payments concurrent creation (service + real repository, transaction double)', () => {
  it('accepts only one of two concurrent payments of 75 on a 100 order', async () => {
    const { service, dispatch, getPayments } = createHarness();
    const outcomes = await Promise.allSettled([
      service.create(tenantId, orderId, dto, 'user-1'),
      service.create(tenantId, orderId, dto, 'user-2'),
    ]);
    expect(
      outcomes.filter((outcome) => outcome.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(BadRequestException);
    expect(rejected?.reason.message).toContain('Remaining: 25.00');
    expect(getPayments().map((payment) => payment.amount)).toEqual([75]);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('allows concurrent payments that exactly fill the order', async () => {
    const { service, dispatch, getPayments } = createHarness();
    await Promise.all([
      service.create(tenantId, orderId, { ...dto, amount: 60 }, 'user-1'),
      service.create(tenantId, orderId, { ...dto, amount: 40 }, 'user-2'),
    ]);
    expect(
      getPayments().reduce((sum, payment) => sum + payment.amount, 0),
    ).toBe(100);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it.each([OrderStatus.CANCELLED, OrderStatus.COMPLETED, OrderStatus.NO_SHOW])(
    'rejects payments on %s orders without events',
    async (status) => {
      const { service, dispatch, getPayments } = createHarness({ status });
      await expect(
        service.create(tenantId, orderId, dto, 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(getPayments()).toEqual([]);
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['other-tenant', false],
    [tenantId, true],
  ] as const)(
    'rejects missing tenant-owned active orders (%s, deleted=%s)',
    async (requestedTenant, deleted) => {
      const { service, dispatch, getPayments } = createHarness({ deleted });
      await expect(
        service.create(requestedTenant, orderId, dto, 'user-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(getPayments()).toEqual([]);
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it('rolls back a failed commit and dispatches no event', async () => {
    const { service, dispatch, getPayments } = createHarness({
      failCommit: true,
    });
    await expect(
      service.create(tenantId, orderId, dto, 'user-1'),
    ).rejects.toThrow('Commit failed');
    expect(getPayments()).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches only after the payment is committed', async () => {
    const { service, dispatch, getPayments } = createHarness();
    dispatch.mockImplementation(() => expect(getPayments()).toHaveLength(1));
    await service.create(tenantId, orderId, dto, 'user-1');
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
