import { Test, TestingModule } from '@nestjs/testing';
import { OrdersRepository } from './orders.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { OrderQueryDto } from './dto/order-query.dto';

describe('OrdersRepository', () => {
  let repo: OrdersRepository;

  const tenantId = 'tenant-1';
  const orderId = 'order-1';
  const branchId = 'branch-1';
  const clientId = 'client-1';
  const mockOrder = { id: orderId, branchId, status: 'PENDING' };

  const tenantClient = {
    order: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.order.findMany.mockResolvedValue([mockOrder]);
    tenantClient.order.findFirst.mockResolvedValue(mockOrder);
    tenantClient.order.update.mockResolvedValue(mockOrder);
    tenantClient.order.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<OrdersRepository>(OrdersRepository);
  });

  describe('findAll', () => {
    it('returns paginated orders with no filters', async () => {
      const query: OrderQueryDto = { page: 1, limit: 10 } as OrderQueryDto;
      const result = await repo.findAll(tenantId, query);
      expect(tenantClient.order.findMany).toHaveBeenCalled();
      expect(tenantClient.order.count).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockOrder], total: 1 });
    });

    it('applies status filter when provided', async () => {
      const query: OrderQueryDto = {
        page: 1,
        limit: 10,
        status: 'PENDING' as any,
      } as OrderQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.order.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe('PENDING');
    });

    it('applies clientId filter when provided', async () => {
      const query: OrderQueryDto = {
        page: 1,
        limit: 10,
        clientId,
      } as OrderQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.order.findMany.mock.calls[0][0];
      expect(callArgs.where.clientId).toBe(clientId);
    });

    it('applies dateFrom filter when provided', async () => {
      const query: OrderQueryDto = {
        page: 1,
        limit: 10,
        dateFrom: '2026-01-01',
      } as OrderQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.order.findMany.mock.calls[0][0];
      expect(callArgs.where.scheduledStart.gte).toEqual(new Date('2026-01-01'));
    });

    it('applies JWT branchId scope when branchId param is provided', async () => {
      const query: OrderQueryDto = { page: 1, limit: 10 } as OrderQueryDto;
      await repo.findAll(tenantId, query, branchId);
      const callArgs = tenantClient.order.findMany.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
    });

    it('applies query branchId when no JWT branchId but query.branchId is set', async () => {
      const query: OrderQueryDto = {
        page: 1,
        limit: 10,
        branchId,
      } as OrderQueryDto;
      await repo.findAll(tenantId, query, null);
      const callArgs = tenantClient.order.findMany.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
    });
  });

  describe('findById', () => {
    it('finds order by id with full includes', async () => {
      const result = await repo.findById(tenantId, orderId);
      expect(tenantClient.order.findFirst).toHaveBeenCalled();
      expect(result).toEqual(mockOrder);
    });

    it('applies branchId scope when provided', async () => {
      await repo.findById(tenantId, orderId, branchId);
      const callArgs = tenantClient.order.findFirst.mock.calls[0][0];
      expect(callArgs.where.branchId).toBe(branchId);
    });
  });

  describe('updateStatus', () => {
    it('updates order status', async () => {
      await repo.updateStatus(tenantId, orderId, 'COMPLETED' as any);
      const callArgs = tenantClient.order.update.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: orderId });
      expect(callArgs.data.status).toBe('COMPLETED');
    });

    it('includes cancellationReason when provided', async () => {
      await repo.updateStatus(tenantId, orderId, 'CANCELLED' as any, 'No show');
      const callArgs = tenantClient.order.update.mock.calls[0][0];
      expect(callArgs.data.cancellationReason).toBe('No show');
    });

    it('does not include cancellationReason when not provided', async () => {
      await repo.updateStatus(tenantId, orderId, 'COMPLETED' as any);
      const callArgs = tenantClient.order.update.mock.calls[0][0];
      expect(callArgs.data.cancellationReason).toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the order', async () => {
      await repo.softDelete(tenantId, orderId);
      const callArgs = tenantClient.order.update.mock.calls[0][0];
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt and includes full relations', async () => {
      await repo.restore(tenantId, orderId);
      const callArgs = tenantClient.order.update.mock.calls[0][0];
      expect(callArgs.data).toEqual({ deletedAt: null });
    });
  });
});
