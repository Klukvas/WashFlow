import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repo: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const mockSubscription = {
    id: 'sub-1',
    tenantId,
    maxUsers: 10,
    maxBranches: 3,
    maxWorkPosts: 8,
    maxServices: 20,
  };

  beforeEach(async () => {
    repo = {
      findByTenantId: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      countUsers: jest.fn().mockResolvedValue(0),
      countBranches: jest.fn().mockResolvedValue(0),
      countWorkPosts: jest.fn().mockResolvedValue(0),
      countServices: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: SubscriptionsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  describe('findByTenantId', () => {
    it('returns the subscription when found', async () => {
      repo.findByTenantId.mockResolvedValue(mockSubscription);
      const result = await service.findByTenantId(tenantId);
      expect(result).toEqual(mockSubscription);
    });

    it('throws NotFoundException when not found', async () => {
      repo.findByTenantId.mockResolvedValue(null);
      await expect(service.findByTenantId(tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsert', () => {
    const dto = { maxUsers: 10, maxBranches: 3, maxWorkPosts: 8, maxServices: 20 };

    it('creates/updates subscription when limits are above current usage', async () => {
      repo.countUsers.mockResolvedValue(5);
      repo.countBranches.mockResolvedValue(2);
      repo.countWorkPosts.mockResolvedValue(4);
      repo.countServices.mockResolvedValue(10);
      repo.upsert.mockResolvedValue(mockSubscription);

      const result = await service.upsert(tenantId, dto);

      expect(result).toEqual(mockSubscription);
      expect(repo.upsert).toHaveBeenCalledWith(tenantId, dto);
    });

    it('throws ConflictException when maxUsers is below current count', async () => {
      repo.countUsers.mockResolvedValue(15);

      await expect(
        service.upsert(tenantId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when maxBranches is below current count', async () => {
      repo.countBranches.mockResolvedValue(5);

      await expect(
        service.upsert(tenantId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when maxWorkPosts is below current count', async () => {
      repo.countWorkPosts.mockResolvedValue(10);

      await expect(
        service.upsert(tenantId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when maxServices is below current count', async () => {
      repo.countServices.mockResolvedValue(25);

      await expect(
        service.upsert(tenantId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('includes all violations in the error message', async () => {
      repo.countUsers.mockResolvedValue(15);
      repo.countBranches.mockResolvedValue(5);
      repo.countWorkPosts.mockResolvedValue(10);
      repo.countServices.mockResolvedValue(25);

      await expect(service.upsert(tenantId, dto)).rejects.toThrow(
        /users.*branches.*work posts.*services/,
      );
    });

    it('allows setting limits equal to current usage', async () => {
      repo.countUsers.mockResolvedValue(10);
      repo.countBranches.mockResolvedValue(3);
      repo.countWorkPosts.mockResolvedValue(8);
      repo.countServices.mockResolvedValue(20);
      repo.upsert.mockResolvedValue(mockSubscription);

      await expect(service.upsert(tenantId, dto)).resolves.toBeDefined();
    });
  });

  describe('delete', () => {
    it('deletes existing subscription', async () => {
      repo.findByTenantId.mockResolvedValue(mockSubscription);
      repo.delete.mockResolvedValue(mockSubscription);

      const result = await service.delete(tenantId);

      expect(result).toEqual(mockSubscription);
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.delete(tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
