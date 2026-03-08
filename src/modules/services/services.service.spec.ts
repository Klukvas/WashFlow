import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { ServicesRepository } from './services.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';

describe('ServicesService', () => {
  let service: ServicesService;
  let repo: Record<string, jest.Mock>;
  let limits: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const serviceId = 'service-1';
  const mockService = {
    id: serviceId,
    tenantId,
    name: 'Car Wash',
    description: 'Full exterior wash',
    durationMin: 30,
    price: 15.99,
    isActive: true,
    sortOrder: 1,
    deletedAt: null,
  };

  beforeEach(async () => {
    repo = {
      findAll: jest.fn().mockResolvedValue([mockService]),
      findActive: jest.fn().mockResolvedValue([mockService]),
      findById: jest.fn().mockResolvedValue(mockService),
      findByIdIncludeDeleted: jest.fn(),
      create: jest.fn().mockResolvedValue(mockService),
      update: jest.fn().mockResolvedValue(mockService),
      softDelete: jest.fn().mockResolvedValue(mockService),
      restore: jest.fn().mockResolvedValue(mockService),
    };

    limits = {
      checkLimit: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ServicesService,
        { provide: ServicesRepository, useValue: repo },
        { provide: SubscriptionLimitsService, useValue: limits },
      ],
    }).compile();

    service = module.get<ServicesService>(ServicesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all services for a tenant', async () => {
      const result = await service.findAll(tenantId);
      expect(repo.findAll).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual([mockService]);
    });

    it('should return an empty array when no services exist', async () => {
      repo.findAll.mockResolvedValue([]);
      const result = await service.findAll(tenantId);
      expect(result).toEqual([]);
    });

    it('should return multiple services', async () => {
      const secondService = {
        ...mockService,
        id: 'service-2',
        name: 'Interior Clean',
      };
      repo.findAll.mockResolvedValue([mockService, secondService]);
      const result = await service.findAll(tenantId);
      expect(result).toHaveLength(2);
    });
  });

  describe('findActive', () => {
    it('should return active services for a tenant', async () => {
      const result = await service.findActive(tenantId);
      expect(repo.findActive).toHaveBeenCalledWith(tenantId);
      expect(result).toEqual([mockService]);
    });

    it('should return an empty array when no active services exist', async () => {
      repo.findActive.mockResolvedValue([]);
      const result = await service.findActive(tenantId);
      expect(result).toEqual([]);
    });

    it('should not include inactive services', async () => {
      const activeOnly = [{ ...mockService, isActive: true }];
      repo.findActive.mockResolvedValue(activeOnly);
      const result = await service.findActive(tenantId);
      expect(result.every((s) => s.isActive)).toBe(true);
    });
  });

  describe('findById', () => {
    it('should return the service when found', async () => {
      const result = await service.findById(tenantId, serviceId);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, serviceId);
      expect(result).toEqual(mockService);
    });

    it('should throw NotFoundException when service does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(tenantId, serviceId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(tenantId, serviceId)).rejects.toThrow(
        'Service not found',
      );
    });
  });

  describe('create', () => {
    it('should check subscription limit before creating', async () => {
      const dto = {
        name: 'Car Wash',
        durationMin: 30,
        price: 15.99,
      };
      await service.create(tenantId, dto as any);
      expect(limits.checkLimit).toHaveBeenCalledWith(tenantId, 'services');
      expect(repo.create).toHaveBeenCalledWith(tenantId, { ...dto });
    });

    it('should throw ForbiddenException when services limit reached', async () => {
      limits.checkLimit.mockRejectedValue(
        new ForbiddenException(
          'Subscription limit reached: maximum 20 services allowed',
        ),
      );

      await expect(
        service.create(tenantId, {
          name: 'Test',
          durationMin: 30,
          price: 10,
        } as any),
      ).rejects.toThrow(ForbiddenException);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('should create a service and return the result', async () => {
      const dto = {
        name: 'Car Wash',
        durationMin: 30,
        price: 15.99,
      };
      const result = await service.create(tenantId, dto as any);
      expect(repo.create).toHaveBeenCalledWith(tenantId, { ...dto });
      expect(result).toEqual(mockService);
    });

    it('should spread the dto to avoid mutation', async () => {
      const dto = { name: 'Car Wash', durationMin: 30, price: 15.99 };
      await service.create(tenantId, dto as any);
      const [, passedData] = repo.create.mock.calls[0];
      expect(passedData).not.toBe(dto);
      expect(passedData).toEqual(dto);
    });

    it('should pass optional fields when provided', async () => {
      const dto = {
        name: 'Premium Wash',
        description: 'Full service',
        durationMin: 60,
        price: 29.99,
        isActive: false,
        sortOrder: 5,
      };
      await service.create(tenantId, dto as any);
      expect(repo.create).toHaveBeenCalledWith(tenantId, { ...dto });
    });
  });

  describe('update', () => {
    it('should find then update the service', async () => {
      const dto = { name: 'Updated Wash' };
      await service.update(tenantId, serviceId, dto as any);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, serviceId);
      expect(repo.update).toHaveBeenCalledWith(tenantId, serviceId, { ...dto });
    });

    it('should return the updated service', async () => {
      const updated = { ...mockService, name: 'Updated Wash' };
      repo.update.mockResolvedValue(updated);
      const result = await service.update(tenantId, serviceId, {
        name: 'Updated Wash',
      } as any);
      expect(result).toEqual(updated);
    });

    it('should spread the dto to avoid mutation', async () => {
      const dto = { price: 19.99 };
      await service.update(tenantId, serviceId, dto as any);
      const [, , passedData] = repo.update.mock.calls[0];
      expect(passedData).not.toBe(dto);
      expect(passedData).toEqual(dto);
    });

    it('should throw NotFoundException when service does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update(tenantId, serviceId, {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not call repo.update when service is not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update(tenantId, serviceId, {} as any),
      ).rejects.toThrow(NotFoundException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should find then soft-delete the service', async () => {
      await service.softDelete(tenantId, serviceId);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, serviceId);
      expect(repo.softDelete).toHaveBeenCalledWith(tenantId, serviceId);
    });

    it('should return the soft-deleted service', async () => {
      const deleted = { ...mockService, deletedAt: new Date() };
      repo.softDelete.mockResolvedValue(deleted);
      const result = await service.softDelete(tenantId, serviceId);
      expect(result).toEqual(deleted);
    });

    it('should throw NotFoundException when service does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.softDelete(tenantId, serviceId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not call repo.softDelete when service is not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.softDelete(tenantId, serviceId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted service', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockService,
        deletedAt: new Date(),
      });
      await service.restore(tenantId, serviceId);
      expect(repo.findByIdIncludeDeleted).toHaveBeenCalledWith(
        tenantId,
        serviceId,
      );
      expect(repo.restore).toHaveBeenCalledWith(tenantId, serviceId);
    });

    it('should return the restored service', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockService,
        deletedAt: new Date(),
      });
      repo.restore.mockResolvedValue(mockService);
      const result = await service.restore(tenantId, serviceId);
      expect(result).toEqual(mockService);
    });

    it('should throw NotFoundException when service is not found', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);
      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);
      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        'Service not found',
      );
    });

    it('should throw BadRequestException when service is not deleted', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockService);
      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException with correct message', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockService);
      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        'Service is not deleted',
      );
    });

    it('should not call repo.restore when service is not found', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);
      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        NotFoundException,
      );
      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('should not call repo.restore when service is not deleted', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockService);
      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('should check subscription limit before restoring', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockService,
        deletedAt: new Date(),
      });
      await service.restore(tenantId, serviceId);
      expect(limits.checkLimit).toHaveBeenCalledWith(tenantId, 'services');
    });

    it('should throw ForbiddenException when services limit reached on restore', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockService,
        deletedAt: new Date(),
      });
      limits.checkLimit.mockRejectedValue(
        new ForbiddenException(
          'Subscription limit reached: maximum 20 services allowed',
        ),
      );

      await expect(service.restore(tenantId, serviceId)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.restore).not.toHaveBeenCalled();
    });
  });
});
