import { Test, TestingModule } from '@nestjs/testing';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

describe('TenantsController', () => {
  let controller: TenantsController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-uuid-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsController,
        { provide: TenantsService, useValue: service },
      ],
    }).compile();

    controller = module.get<TenantsController>(TenantsController);
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with no arguments', async () => {
      await controller.findAll();

      expect(service.findAll).toHaveBeenCalledWith();
    });
  });

  describe('findOne', () => {
    it('should delegate to service.findById with id', async () => {
      await controller.findOne(tenantId);

      expect(service.findById).toHaveBeenCalledWith(tenantId);
    });
  });

  describe('create', () => {
    it('should delegate to service.create with dto', async () => {
      const dto: CreateTenantDto = { name: 'Acme Corp' } as CreateTenantDto;

      await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with id and dto', async () => {
      const dto: UpdateTenantDto = { name: 'Acme Corp Updated' } as UpdateTenantDto;

      await controller.update(tenantId, dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, dto);
    });
  });
});
