import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsRepository } from './payments.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { EventType } from '../../common/events/event-types';

const TENANT_ID = 'tenant-abc';
const ORDER_ID = 'order-xyz';

const makePaymentDto = (overrides: Record<string, unknown> = {}) => ({
  amount: 150.0,
  method: 'CARD',
  reference: 'REF-001',
  ...overrides,
});

const makePayment = (overrides: Record<string, unknown> = {}) => ({
  id: 'payment-1',
  tenantId: TENANT_ID,
  orderId: ORDER_ID,
  amount: 150.0,
  method: 'CARD',
  reference: 'REF-001',
  status: 'PAID',
  ...overrides,
});

describe('PaymentsService', () => {
  let service: PaymentsService;
  let paymentsRepo: { findByOrderId: jest.Mock; create: jest.Mock };
  let tenantPrisma: { forTenant: jest.Mock };
  let orderFindFirst: jest.Mock;
  let paymentFindMany: jest.Mock;
  let eventDispatcher: { dispatch: jest.Mock };

  beforeEach(async () => {
    paymentsRepo = {
      findByOrderId: jest.fn(),
      create: jest.fn(),
    };

    orderFindFirst = jest
      .fn()
      .mockResolvedValue({ id: ORDER_ID, status: 'PENDING', totalPrice: 1000 });
    paymentFindMany = jest.fn().mockResolvedValue([]);
    tenantPrisma = {
      forTenant: jest.fn().mockReturnValue({
        order: { findFirst: orderFindFirst },
        payment: { findMany: paymentFindMany },
      }),
    };

    eventDispatcher = {
      dispatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PaymentsRepository, useValue: paymentsRepo },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: EventDispatcherService, useValue: eventDispatcher },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── findByOrderId ────────────────────────────────────────────────────────

  describe('findByOrderId', () => {
    it('returns the payment returned by the repository', async () => {
      const payment = makePayment();
      paymentsRepo.findByOrderId.mockResolvedValue(payment);

      const result = await service.findByOrderId(TENANT_ID, ORDER_ID);

      expect(result).toEqual(payment);
    });

    it('passes tenantId and orderId to the repository', async () => {
      paymentsRepo.findByOrderId.mockResolvedValue(null);

      await service.findByOrderId(TENANT_ID, ORDER_ID);

      expect(paymentsRepo.findByOrderId).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
      );
      expect(paymentsRepo.findByOrderId).toHaveBeenCalledTimes(1);
    });

    it('returns null when no payment exists for the order', async () => {
      paymentsRepo.findByOrderId.mockResolvedValue(null);

      const result = await service.findByOrderId(
        TENANT_ID,
        'non-existent-order',
      );

      expect(result).toBeNull();
    });

    it('returns an empty array when the repository returns one', async () => {
      paymentsRepo.findByOrderId.mockResolvedValue([]);

      const result = await service.findByOrderId(TENANT_ID, ORDER_ID);

      expect(result).toEqual([]);
    });

    it('propagates repository errors', async () => {
      paymentsRepo.findByOrderId.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(service.findByOrderId(TENANT_ID, ORDER_ID)).rejects.toThrow(
        'DB connection lost',
      );
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a payment via the repository and returns it', async () => {
      const dto = makePaymentDto();
      const payment = makePayment();
      paymentsRepo.create.mockResolvedValue(payment);

      const result = await service.create(TENANT_ID, ORDER_ID, dto as any);

      expect(result).toEqual(payment);
    });

    it('passes the correct payload to the repository including status PAID', async () => {
      const dto = makePaymentDto();
      const payment = makePayment();
      paymentsRepo.create.mockResolvedValue(payment);

      await service.create(TENANT_ID, ORDER_ID, dto as any);

      expect(paymentsRepo.create).toHaveBeenCalledWith(TENANT_ID, {
        amount: dto.amount,
        method: dto.method,
        reference: dto.reference,
        status: 'PAID',
        orderId: ORDER_ID,
      });
    });

    it('dispatches a PaymentReceivedEvent after a successful create', async () => {
      const dto = makePaymentDto();
      const payment = makePayment();
      paymentsRepo.create.mockResolvedValue(payment);

      await service.create(TENANT_ID, ORDER_ID, dto as any);

      expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
    });

    it('dispatches an event with eventType PAYMENT_RECEIVED', async () => {
      const dto = makePaymentDto();
      const payment = makePayment();
      paymentsRepo.create.mockResolvedValue(payment);

      await service.create(TENANT_ID, ORDER_ID, dto as any);

      const [dispatchedEvent] = eventDispatcher.dispatch.mock.calls[0];
      expect(dispatchedEvent.eventType).toBe(EventType.PAYMENT_RECEIVED);
    });

    it('dispatches an event carrying tenantId, paymentId, orderId and amount', async () => {
      const dto = makePaymentDto();
      const payment = makePayment({ id: 'payment-99' });
      paymentsRepo.create.mockResolvedValue(payment);

      await service.create(TENANT_ID, ORDER_ID, dto as any);

      const [dispatchedEvent] = eventDispatcher.dispatch.mock.calls[0];
      expect(dispatchedEvent.tenantId).toBe(TENANT_ID);
      expect(dispatchedEvent.payload).toMatchObject({
        paymentId: 'payment-99',
        orderId: ORDER_ID,
        amount: dto.amount,
        method: dto.method,
      });
    });

    it('does not dispatch an event when the repository throws', async () => {
      paymentsRepo.create.mockRejectedValue(new Error('Insert failed'));

      await expect(
        service.create(TENANT_ID, ORDER_ID, makePaymentDto() as any),
      ).rejects.toThrow('Insert failed');

      expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('propagates repository errors', async () => {
      paymentsRepo.create.mockRejectedValue(new Error('Unique constraint'));

      await expect(
        service.create(TENANT_ID, ORDER_ID, makePaymentDto() as any),
      ).rejects.toThrow('Unique constraint');
    });

    it('does not mutate the incoming DTO', async () => {
      const dto = makePaymentDto();
      const frozen = Object.freeze({ ...dto });
      paymentsRepo.create.mockResolvedValue(makePayment());

      await expect(
        service.create(TENANT_ID, ORDER_ID, frozen as any),
      ).resolves.not.toThrow();
    });

    it('throws NotFoundException when order does not belong to tenant', async () => {
      orderFindFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, ORDER_ID, makePaymentDto() as any),
      ).rejects.toThrow(NotFoundException);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(TENANT_ID);
      expect(orderFindFirst).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
      });
    });

    it('does not create payment when order not found', async () => {
      orderFindFirst.mockResolvedValue(null);

      await expect(
        service.create(TENANT_ID, ORDER_ID, makePaymentDto() as any),
      ).rejects.toThrow(NotFoundException);

      expect(paymentsRepo.create).not.toHaveBeenCalled();
      expect(eventDispatcher.dispatch).not.toHaveBeenCalled();
    });
  });
});
