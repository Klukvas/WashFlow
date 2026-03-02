import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';
import type { CreateVehicleDto } from './dto/create-vehicle.dto';
import type { UpdateVehicleDto } from './dto/update-vehicle.dto';
import type { VehicleQueryDto } from './dto/vehicle-query.dto';

const TENANT_ID  = 'tenant-uuid-1111';
const VEHICLE_ID = 'vehicle-uuid-2222';

const mockVehiclesService = {
  findAll:    jest.fn(),
  findById:   jest.fn(),
  create:     jest.fn(),
  update:     jest.fn(),
  softDelete: jest.fn(),
  restore:    jest.fn(),
};

describe('VehiclesController', () => {
  let controller: VehiclesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        { provide: VehiclesService, useValue: mockVehiclesService },
      ],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permissions.guard').PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<VehiclesController>(VehiclesController);
  });

  describe('findAll', () => {
    it('delegates to vehiclesService.findAll with tenantId and query', async () => {
      const query: VehicleQueryDto = { page: 1, limit: 10 } as VehicleQueryDto;
      const expected = { data: [], total: 0 };
      mockVehiclesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(TENANT_ID, query);

      expect(mockVehiclesService.findAll).toHaveBeenCalledTimes(1);
      expect(mockVehiclesService.findAll).toHaveBeenCalledWith(TENANT_ID, query);
      expect(result).toBe(expected);
    });
  });

  describe('findOne', () => {
    it('delegates to vehiclesService.findById with tenantId and id', async () => {
      const expected = { id: VEHICLE_ID };
      mockVehiclesService.findById.mockResolvedValue(expected);

      const result = await controller.findOne(TENANT_ID, VEHICLE_ID);

      expect(mockVehiclesService.findById).toHaveBeenCalledTimes(1);
      expect(mockVehiclesService.findById).toHaveBeenCalledWith(TENANT_ID, VEHICLE_ID);
      expect(result).toBe(expected);
    });
  });

  describe('create', () => {
    it('delegates to vehiclesService.create with tenantId and dto', async () => {
      const dto: CreateVehicleDto = { licensePlate: 'ABC-123' } as CreateVehicleDto;
      const expected = { id: VEHICLE_ID, licensePlate: 'ABC-123' };
      mockVehiclesService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT_ID, dto);

      expect(mockVehiclesService.create).toHaveBeenCalledTimes(1);
      expect(mockVehiclesService.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('delegates to vehiclesService.update with tenantId, id and dto', async () => {
      const dto: UpdateVehicleDto = { licensePlate: 'XYZ-999' } as UpdateVehicleDto;
      const expected = { id: VEHICLE_ID, licensePlate: 'XYZ-999' };
      mockVehiclesService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT_ID, VEHICLE_ID, dto);

      expect(mockVehiclesService.update).toHaveBeenCalledTimes(1);
      expect(mockVehiclesService.update).toHaveBeenCalledWith(TENANT_ID, VEHICLE_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('remove', () => {
    it('delegates to vehiclesService.softDelete with tenantId and id', async () => {
      const expected = { deleted: true };
      mockVehiclesService.softDelete.mockResolvedValue(expected);

      const result = await controller.remove(TENANT_ID, VEHICLE_ID);

      expect(mockVehiclesService.softDelete).toHaveBeenCalledTimes(1);
      expect(mockVehiclesService.softDelete).toHaveBeenCalledWith(TENANT_ID, VEHICLE_ID);
      expect(result).toBe(expected);
    });
  });

  describe('restore', () => {
    it('delegates to vehiclesService.restore with tenantId and id', async () => {
      const expected = { id: VEHICLE_ID };
      mockVehiclesService.restore.mockResolvedValue(expected);

      const result = await controller.restore(TENANT_ID, VEHICLE_ID);

      expect(mockVehiclesService.restore).toHaveBeenCalledTimes(1);
      expect(mockVehiclesService.restore).toHaveBeenCalledWith(TENANT_ID, VEHICLE_ID);
      expect(result).toBe(expected);
    });
  });
});
