import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsRepository } from './payments.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('PaymentsRepository', () => {
  let repo: PaymentsRepository;

  const tenantId = 'tenant-1';
  const orderId = 'order-1';

  const mockPayment = { id: 'pay-1', orderId, amount: 100 };

  const tenantClient = {
    payment: {
      findMany: jest.fn().mockResolvedValue([mockPayment]),
      create: jest.fn().mockResolvedValue(mockPayment),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.payment.findMany.mockResolvedValue([mockPayment]);
    tenantClient.payment.create.mockResolvedValue(mockPayment);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<PaymentsRepository>(PaymentsRepository);
  });

  describe('findByOrderId', () => {
    it('returns payments for the given order, ordered by createdAt desc', async () => {
      const result = await repo.findByOrderId(tenantId, orderId);
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(tenantId);
      expect(tenantClient.payment.findMany).toHaveBeenCalledWith({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockPayment]);
    });
  });

  describe('create', () => {
    it('creates a payment record', async () => {
      const data = { orderId, amount: 250, method: 'CASH' };
      await repo.create(tenantId, data);
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(tenantId);
      expect(tenantClient.payment.create).toHaveBeenCalledWith({ data });
    });
  });
});
