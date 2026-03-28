import { Test, TestingModule } from '@nestjs/testing';
import { ClientsRepository } from './clients.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ClientQueryDto } from './dto/client-query.dto';

describe('ClientsRepository', () => {
  let repo: ClientsRepository;

  const tenantId = 'tenant-1';
  const clientId = 'client-1';
  const survivorId = 'client-survivor';
  const duplicateId = 'client-duplicate';

  const mockClient = { id: clientId, firstName: 'Alice', vehicles: [] };

  const tenantClient = {
    client: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    order: {
      count: jest.fn().mockResolvedValue(5),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.client.findMany.mockResolvedValue([mockClient]);
    tenantClient.client.findFirst.mockResolvedValue(mockClient);
    tenantClient.client.create.mockResolvedValue(mockClient);
    tenantClient.client.update.mockResolvedValue(mockClient);
    tenantClient.client.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientsRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<ClientsRepository>(ClientsRepository);
  });

  describe('findAll', () => {
    it('returns paginated clients with no filters', async () => {
      const query: ClientQueryDto = { page: 1, limit: 10 } as ClientQueryDto;
      const result = await repo.findAll(tenantId, query);
      expect(tenantClient.client.findMany).toHaveBeenCalled();
      expect(tenantClient.client.count).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockClient], total: 1 });
    });

    it('applies search filter across name, phone, email fields when provided', async () => {
      const query: ClientQueryDto = {
        page: 1,
        limit: 10,
        search: 'alice',
      } as ClientQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.client.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(4);
    });

    it('does not include OR filter when search is not provided', async () => {
      const query: ClientQueryDto = { page: 1, limit: 10 } as ClientQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.client.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('finds client by id and includes vehicles and recent orders', async () => {
      const result = await repo.findById(tenantId, clientId);
      expect(tenantClient.client.findFirst).toHaveBeenCalledWith({
        where: { id: clientId },
        include: {
          vehicles: true,
          orders: { take: 10, orderBy: { createdAt: 'desc' } },
        },
      });
      expect(result).toEqual({ ...mockClient, totalOrders: 5 });
    });
  });

  describe('create', () => {
    it('creates client and includes vehicles relation', async () => {
      const data = { firstName: 'Bob', lastName: 'Smith' };
      await repo.create(tenantId, data);
      expect(tenantClient.client.create).toHaveBeenCalledWith({
        data,
        include: { vehicles: true },
      });
    });
  });

  describe('update', () => {
    it('updates client by id and includes vehicles relation', async () => {
      const data = { firstName: 'Charlie' };
      await repo.update(tenantId, clientId, data);
      expect(tenantClient.client.update).toHaveBeenCalledWith({
        where: { id: clientId },
        data,
        include: { vehicles: true },
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the client', async () => {
      await repo.softDelete(tenantId, clientId);
      const callArgs = tenantClient.client.update.mock.calls[0][0];
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt and includes vehicles', async () => {
      await repo.restore(tenantId, clientId);
      expect(tenantClient.client.update).toHaveBeenCalledWith({
        where: { id: clientId },
        data: { deletedAt: null },
        include: { vehicles: true },
      });
    });
  });

  describe('merge', () => {
    const mockTx = {
      vehicle: {
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      client: {
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(mockClient),
      },
    };

    beforeEach(() => {
      jest.clearAllMocks();
      mockTx.client.findFirst.mockResolvedValue(mockClient);
      mockTx.vehicle.update.mockResolvedValue({});
      mockTx.order.updateMany.mockResolvedValue({ count: 1 });
      mockTx.client.update.mockResolvedValue({});
    });

    it('moves vehicles without duplicate license plates to target client', async () => {
      mockTx.vehicle.findMany
        .mockResolvedValueOnce([
          { id: 'v1', licensePlate: 'ABC-123', clientId: duplicateId },
        ])
        .mockResolvedValueOnce([]); // target has no vehicles

      await repo.merge(mockTx as any, duplicateId, survivorId, {});

      expect(mockTx.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v1' },
          data: { clientId: survivorId },
        }),
      );
    });

    it('soft-deletes duplicate source vehicle when license plate exists on target', async () => {
      mockTx.vehicle.findMany
        .mockResolvedValueOnce([
          { id: 'v-src', licensePlate: 'XYZ-999', clientId: duplicateId },
        ])
        .mockResolvedValueOnce([
          { id: 'v-tgt', licensePlate: 'XYZ-999', clientId: survivorId },
        ]);

      await repo.merge(mockTx as any, duplicateId, survivorId, {});

      expect(mockTx.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { vehicleId: 'v-src' } }),
      );
      expect(mockTx.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v-src' },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('re-points all orders from source to target client', async () => {
      mockTx.vehicle.findMany.mockResolvedValue([]);
      await repo.merge(mockTx as any, duplicateId, survivorId, {});
      expect(mockTx.order.updateMany).toHaveBeenCalledWith({
        where: { clientId: duplicateId },
        data: { clientId: survivorId },
      });
    });

    it('updates target client with field overrides', async () => {
      mockTx.vehicle.findMany.mockResolvedValue([]);
      const overrides = { phone: '555-1234' };
      await repo.merge(mockTx as any, duplicateId, survivorId, overrides);
      expect(mockTx.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: survivorId },
          data: overrides,
        }),
      );
    });

    it('soft-deletes source client after merge', async () => {
      mockTx.vehicle.findMany.mockResolvedValue([]);
      await repo.merge(mockTx as any, duplicateId, survivorId, {});
      expect(mockTx.client.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: duplicateId },
          data: { deletedAt: expect.any(Date) },
        }),
      );
    });

    it('returns the merged target client', async () => {
      mockTx.vehicle.findMany.mockResolvedValue([]);
      const result = await repo.merge(
        mockTx as any,
        duplicateId,
        survivorId,
        {},
      );
      expect(mockTx.client.findFirst).toHaveBeenCalledWith({
        where: { id: survivorId },
        include: { vehicles: true },
      });
      expect(result).toEqual(mockClient);
    });
  });
});
