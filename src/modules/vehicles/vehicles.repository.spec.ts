import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesRepository } from './vehicles.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { VehicleQueryDto } from './dto/vehicle-query.dto';

describe('VehiclesRepository', () => {
  let repo: VehiclesRepository;

  const tenantId = 'tenant-1';
  const vehicleId = 'vehicle-1';
  const clientId = 'client-1';
  const mockVehicle = { id: vehicleId, clientId, make: 'Toyota', client: {} };

  const tenantClient = {
    vehicle: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
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
    tenantClient.vehicle.findMany.mockResolvedValue([mockVehicle]);
    tenantClient.vehicle.findFirst.mockResolvedValue(mockVehicle);
    tenantClient.vehicle.create.mockResolvedValue(mockVehicle);
    tenantClient.vehicle.update.mockResolvedValue(mockVehicle);
    tenantClient.vehicle.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<VehiclesRepository>(VehiclesRepository);
  });

  describe('findAll', () => {
    it('returns paginated vehicles with no filters', async () => {
      const query: VehicleQueryDto = { page: 1, limit: 10 } as VehicleQueryDto;
      const result = await repo.findAll(tenantId, query);
      expect(tenantClient.vehicle.findMany).toHaveBeenCalled();
      expect(tenantClient.vehicle.count).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockVehicle], total: 1 });
    });

    it('applies clientId filter when provided', async () => {
      const query: VehicleQueryDto = {
        page: 1,
        limit: 10,
        clientId,
      } as VehicleQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.vehicle.findMany.mock.calls[0][0];
      expect(callArgs.where.clientId).toBe(clientId);
    });

    it('applies search filter across make, model, licensePlate when provided', async () => {
      const query: VehicleQueryDto = {
        page: 1,
        limit: 10,
        search: 'Toyota',
      } as VehicleQueryDto;
      await repo.findAll(tenantId, query);
      const callArgs = tenantClient.vehicle.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(3);
    });
  });

  describe('findByClientId', () => {
    it('returns vehicles for a client ordered by createdAt desc', async () => {
      const result = await repo.findByClientId(tenantId, clientId);
      expect(tenantClient.vehicle.findMany).toHaveBeenCalledWith({
        where: { clientId },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([mockVehicle]);
    });
  });

  describe('findById', () => {
    it('finds vehicle by id and includes client', async () => {
      const result = await repo.findById(tenantId, vehicleId);
      expect(tenantClient.vehicle.findFirst).toHaveBeenCalledWith({
        where: { id: vehicleId },
        include: { client: true },
      });
      expect(result).toEqual(mockVehicle);
    });
  });

  describe('create', () => {
    it('creates vehicle and includes client relation', async () => {
      const data = { make: 'Honda', clientId };
      await repo.create(tenantId, data);
      expect(tenantClient.vehicle.create).toHaveBeenCalledWith({
        data,
        include: { client: true },
      });
    });
  });

  describe('update', () => {
    it('updates vehicle by id and includes client relation', async () => {
      const data = { make: 'BMW' };
      await repo.update(tenantId, vehicleId, data);
      expect(tenantClient.vehicle.update).toHaveBeenCalledWith({
        where: { id: vehicleId },
        data,
        include: { client: true },
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the vehicle', async () => {
      await repo.softDelete(tenantId, vehicleId);
      const callArgs = tenantClient.vehicle.update.mock.calls[0][0];
      expect(callArgs.where).toEqual({ id: vehicleId });
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt and includes client relation', async () => {
      await repo.restore(tenantId, vehicleId);
      expect(tenantClient.vehicle.update).toHaveBeenCalledWith({
        where: { id: vehicleId },
        data: { deletedAt: null },
        include: { client: true },
      });
    });
  });
});
