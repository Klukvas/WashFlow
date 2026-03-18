import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { VehiclesRepository } from './vehicles.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let repo: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const vehicleId = 'vehicle-1';
  const mockVehicle = {
    id: vehicleId,
    tenantId,
    clientId: 'client-1',
    make: 'Toyota',
    model: 'Camry',
    licensePlate: 'AA1234BB',
    deletedAt: null,
  };

  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    repo = {
      findAll: jest.fn().mockResolvedValue({ items: [mockVehicle], total: 1 }),
      findByClientId: jest.fn().mockResolvedValue([mockVehicle]),
      findById: jest.fn().mockResolvedValue(mockVehicle),
      findByIdIncludeDeleted: jest.fn(),
      create: jest.fn().mockResolvedValue(mockVehicle),
      update: jest.fn().mockResolvedValue(mockVehicle),
      softDelete: jest.fn().mockResolvedValue(mockVehicle),
      restore: jest.fn().mockResolvedValue(mockVehicle),
    };

    tenantPrisma = {
      forTenant: jest.fn().mockReturnValue({
        client: {
          findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }),
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: VehiclesRepository, useValue: repo },
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
  });

  describe('findAll', () => {
    it('should return paginated vehicles', async () => {
      const query = { page: 1, limit: 20 };
      const result = await service.findAll(tenantId, query as any);
      expect(repo.findAll).toHaveBeenCalledWith(tenantId, query);
      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
    });
  });

  describe('findByClientId', () => {
    it('should return vehicles for a client', async () => {
      const result = await service.findByClientId(tenantId, 'client-1');
      expect(repo.findByClientId).toHaveBeenCalledWith(tenantId, 'client-1');
      expect(result).toEqual([mockVehicle]);
    });
  });

  describe('findById', () => {
    it('should return vehicle when found', async () => {
      const result = await service.findById(tenantId, vehicleId);
      expect(result).toEqual(mockVehicle);
    });

    it('should throw NotFoundException when not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(tenantId, vehicleId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a vehicle', async () => {
      const dto = { clientId: 'client-1', make: 'Toyota', model: 'Camry' };
      await service.create(tenantId, dto as any);
      expect(repo.create).toHaveBeenCalledWith(tenantId, { ...dto });
    });
  });

  describe('update', () => {
    it('should find then update vehicle', async () => {
      const dto = { model: 'Corolla' };
      await service.update(tenantId, vehicleId, dto as any);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, vehicleId);
      expect(repo.update).toHaveBeenCalledWith(tenantId, vehicleId, { ...dto });
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update(tenantId, vehicleId, {} as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('should find then soft-delete vehicle', async () => {
      await service.softDelete(tenantId, vehicleId);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, vehicleId);
      expect(repo.softDelete).toHaveBeenCalledWith(tenantId, vehicleId);
    });

    it('should throw NotFoundException if vehicle does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.softDelete(tenantId, vehicleId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('should restore a deleted vehicle', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockVehicle,
        deletedAt: new Date(),
      });
      await service.restore(tenantId, vehicleId);
      expect(repo.restore).toHaveBeenCalledWith(tenantId, vehicleId);
    });

    it('should throw NotFoundException when vehicle not found', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);
      await expect(service.restore(tenantId, vehicleId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when vehicle is not deleted', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockVehicle);
      await expect(service.restore(tenantId, vehicleId)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('updatePhoto', () => {
    it('should find vehicle then call repo.update with photoUrl and return result', async () => {
      const photoUrl = '/uploads/vehicles/photo.jpg';
      const updated = { ...mockVehicle, photoUrl };
      repo.update.mockResolvedValue(updated);

      const result = await service.updatePhoto(tenantId, vehicleId, photoUrl);

      expect(repo.findById).toHaveBeenCalledWith(tenantId, vehicleId);
      expect(repo.update).toHaveBeenCalledWith(tenantId, vehicleId, {
        photoUrl,
      });
      expect(result).toEqual(updated);
    });

    it('should throw NotFoundException when vehicle does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updatePhoto(tenantId, vehicleId, '/uploads/vehicles/photo.jpg'),
      ).rejects.toThrow(NotFoundException);

      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
