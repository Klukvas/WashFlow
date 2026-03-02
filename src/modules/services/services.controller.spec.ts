import { Test, TestingModule } from '@nestjs/testing';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

describe('ServicesController', () => {
  let controller: ServicesController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-uuid-1';
  const serviceId = 'service-uuid-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      softDelete: jest.fn().mockResolvedValue({}),
      restore: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesController,
        { provide: ServicesService, useValue: service },
      ],
    }).compile();

    controller = module.get<ServicesController>(ServicesController);
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with tenantId', async () => {
      await controller.findAll(tenantId);

      expect(service.findAll).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('findOne', () => {
    it('should delegate to service.findById with tenantId and id', async () => {
      await controller.findOne(tenantId, serviceId);

      expect(service.findById).toHaveBeenCalledWith(tenantId, serviceId);
    });
  });

  describe('create', () => {
    it('should delegate to service.create with tenantId and dto', async () => {
      const dto: CreateServiceDto = { name: 'Car Wash' } as CreateServiceDto;

      await controller.create(tenantId, dto);

      expect(service.create).toHaveBeenCalledWith(tenantId, dto);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with tenantId, id, and dto', async () => {
      const dto: UpdateServiceDto = {
        name: 'Premium Car Wash',
      } as UpdateServiceDto;

      await controller.update(tenantId, serviceId, dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, serviceId, dto);
    });
  });

  describe('remove', () => {
    it('should delegate to service.softDelete with tenantId and id', async () => {
      await controller.remove(tenantId, serviceId);

      expect(service.softDelete).toHaveBeenCalledWith(tenantId, serviceId);
    });
  });

  describe('restore', () => {
    it('should delegate to service.restore with tenantId and id', async () => {
      await controller.restore(tenantId, serviceId);

      expect(service.restore).toHaveBeenCalledWith(tenantId, serviceId);
    });
  });
});
