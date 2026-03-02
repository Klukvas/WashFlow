import { Test, TestingModule } from '@nestjs/testing';
import { ServicesRepository } from './services.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('ServicesRepository', () => {
  let repo: ServicesRepository;

  const tenantId = 'tenant-1';
  const serviceId = 'svc-1';
  const mockService = { id: serviceId, name: 'Full Wash', isActive: true };

  const tenantClient = {
    service: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.service.findMany.mockResolvedValue([mockService]);
    tenantClient.service.findFirst.mockResolvedValue(mockService);
    tenantClient.service.create.mockResolvedValue(mockService);
    tenantClient.service.update.mockResolvedValue(mockService);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<ServicesRepository>(ServicesRepository);
  });

  describe('findAll', () => {
    it('returns all services ordered by sortOrder then name', async () => {
      const result = await repo.findAll(tenantId);
      expect(tenantClient.service.findMany).toHaveBeenCalledWith({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toEqual([mockService]);
    });
  });

  describe('findActive', () => {
    it('returns only active services', async () => {
      const result = await repo.findActive(tenantId);
      expect(tenantClient.service.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      expect(result).toEqual([mockService]);
    });
  });

  describe('findById', () => {
    it('finds service by id', async () => {
      const result = await repo.findById(tenantId, serviceId);
      expect(tenantClient.service.findFirst).toHaveBeenCalledWith({
        where: { id: serviceId },
      });
      expect(result).toEqual(mockService);
    });
  });

  describe('findByIds', () => {
    it('finds active services matching provided ids', async () => {
      const ids = [serviceId, 'svc-2'];
      await repo.findByIds(tenantId, ids);
      expect(tenantClient.service.findMany).toHaveBeenCalledWith({
        where: { id: { in: ids }, isActive: true },
      });
    });
  });

  describe('create', () => {
    it('creates a service with provided data', async () => {
      const data = { name: 'Quick Wash', isActive: true };
      await repo.create(tenantId, data);
      expect(tenantClient.service.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('update', () => {
    it('updates a service by id', async () => {
      const data = { name: 'Premium Wash' };
      await repo.update(tenantId, serviceId, data);
      expect(tenantClient.service.update).toHaveBeenCalledWith({
        where: { id: serviceId },
        data,
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt to current time', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-22'));
      await repo.softDelete(tenantId, serviceId);
      expect(tenantClient.service.update).toHaveBeenCalledWith({
        where: { id: serviceId },
        data: { deletedAt: new Date('2026-02-22') },
      });
      jest.useRealTimers();
    });
  });

  describe('restore', () => {
    it('sets deletedAt to null', async () => {
      await repo.restore(tenantId, serviceId);
      expect(tenantClient.service.update).toHaveBeenCalledWith({
        where: { id: serviceId },
        data: { deletedAt: null },
      });
    });
  });
});
