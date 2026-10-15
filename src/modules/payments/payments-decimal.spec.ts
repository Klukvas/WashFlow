import { PaymentMethod, PaymentStatus, Prisma } from '@prisma/client';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const tenantId = 'tenant-1';
const orderId = 'order-1';

// Exercise the service and repository together; only the Prisma transport is doubled.
function createHarness(
  totalPrice: string | null,
  amounts: string[],
  status: PaymentStatus = PaymentStatus.PAID,
) {
  const existingPayments = amounts.map((amount) => ({
    amount: new Prisma.Decimal(amount),
    status,
  }));
  const create = jest.fn(
    async ({ data }: { data: Prisma.PaymentUncheckedCreateInput }) => ({
      id: 'payment-new',
      ...data,
    }),
  );
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([
      {
        id: orderId,
        status: 'BOOKED',
        totalPrice: totalPrice === null ? null : new Prisma.Decimal(totalPrice),
      },
    ]),
    payment: {
      findMany: jest.fn().mockResolvedValue(existingPayments),
      create,
    },
  };
  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue({
      $transaction: async (
        callback: (transaction: typeof tx) => Promise<unknown>,
      ) => callback(tx),
    }),
  } as unknown as TenantPrismaService;
  const dispatch = jest.fn();
  const service = new PaymentsService(
    new PaymentsRepository(tenantPrisma),
    tenantPrisma,
    { dispatch } as unknown as EventDispatcherService,
  );
  return { service, create, dispatch };
}

describe('Payments exact decimal arithmetic (service + real repository)', () => {
  it.each([
    { total: '0.30', paid: ['0.10'], amount: 0.2 },
    { total: '0.30', paid: ['0.20'], amount: 0.1 },
    { total: '0.30', paid: ['0.10', '0.10'], amount: 0.1 },
    { total: '1.80', paid: Array<string>(17).fill('0.10'), amount: 0.1 },
    { total: '1.10', paid: ['0.10', '0.20', '0.30'], amount: 0.5 },
  ])('accepts an exact final payment: %j', async ({ total, paid, amount }) => {
    const { service, create, dispatch } = createHarness(total, paid);

    const result = await service.create(
      tenantId,
      orderId,
      { amount, method: PaymentMethod.CARD },
      'user-1',
    );

    expect(result).toMatchObject({ amount, tenantId, orderId });
    expect(create).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ amount }) }),
    );
  });

  it.each([
    { total: '0.30', paid: ['0.10'], amount: 0.21, remaining: '0.20' },
    { total: '0.30', paid: ['0.10', '0.10'], amount: 0.11, remaining: '0.10' },
    {
      total: '1.00',
      paid: Array<string>(10).fill('0.10'),
      amount: 0.01,
      remaining: '0.00',
    },
  ])(
    'rejects a real excess with the exact remaining amount: %j',
    async ({ total, paid, amount, remaining }) => {
      const { service, create, dispatch } = createHarness(total, paid);

      await expect(
        service.create(
          tenantId,
          orderId,
          { amount, method: PaymentMethod.CASH },
          'user-1',
        ),
      ).rejects.toThrow(
        `Payment would exceed order total. Remaining: ${remaining}`,
      );

      expect(create).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    },
  );

  it.each([null, '0.00'])(
    'preserves uncapped payments for order total %s',
    async (total) => {
      const { service, create } = createHarness(total, ['100.00']);

      await expect(
        service.create(
          tenantId,
          orderId,
          { amount: 100, method: PaymentMethod.CASH },
          'user-1',
        ),
      ).resolves.toMatchObject({ amount: 100 });
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  it.each(Object.values(PaymentStatus))(
    'continues counting existing %s payments',
    async (status) => {
      const { service, create } = createHarness('0.30', ['0.10'], status);

      await expect(
        service.create(
          tenantId,
          orderId,
          { amount: 0.21, method: PaymentMethod.CARD },
          'user-1',
        ),
      ).rejects.toThrow('Remaining: 0.20');
      expect(create).not.toHaveBeenCalled();
    },
  );

  it('preserves an explicitly requested pending payment status', async () => {
    const { service } = createHarness('0.30', ['0.10']);

    await expect(
      service.create(
        tenantId,
        orderId,
        { amount: 0.2, method: PaymentMethod.CARD, status: 'PENDING' },
        'user-1',
      ),
    ).resolves.toMatchObject({ status: PaymentStatus.PENDING, amount: 0.2 });
  });
});
