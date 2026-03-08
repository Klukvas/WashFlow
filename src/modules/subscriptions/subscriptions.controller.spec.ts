import { Test, TestingModule } from '@nestjs/testing';
import {
  SubscriptionUsageController,
  SubscriptionAdminController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { UpsertSubscriptionDto } from './dto/upsert-subscription.dto';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const mockUsage = {
  users: { current: 5, max: 15, percentage: 33 },
  branches: { current: 2, max: 3, percentage: 67 },
  workPosts: { current: 6, max: 10, percentage: 60 },
  services: { current: 8, max: 20, percentage: 40 },
  isTrial: true,
  trialEndsAt: new Date('2026-04-01'),
};

const mockSubscription = {
  id: 'sub-1',
  tenantId: TENANT_ID,
  maxUsers: 15,
  maxBranches: 3,
  maxWorkPosts: 10,
  maxServices: 20,
  isTrial: false,
  trialEndsAt: null,
  paddleSubscriptionId: null,
  paddleCustomerId: null,
  paddleStatus: null,
  currentPeriodEnd: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// SubscriptionUsageController
// ---------------------------------------------------------------------------

describe('SubscriptionUsageController', () => {
  let controller: SubscriptionUsageController;
  let limitsService: { getUsage: jest.Mock };

  beforeEach(async () => {
    limitsService = { getUsage: jest.fn().mockResolvedValue(mockUsage) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionUsageController],
      providers: [
        { provide: SubscriptionLimitsService, useValue: limitsService },
      ],
    }).compile();

    controller = module.get<SubscriptionUsageController>(
      SubscriptionUsageController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getUsage', () => {
    it('returns usage data from limits service', async () => {
      const result = await controller.getUsage(TENANT_ID);

      expect(result).toEqual(mockUsage);
    });

    it('passes tenantId to limits service', async () => {
      await controller.getUsage(TENANT_ID);

      expect(limitsService.getUsage).toHaveBeenCalledWith(TENANT_ID);
    });

    it('propagates errors from limits service', async () => {
      limitsService.getUsage.mockRejectedValue(new Error('DB error'));

      await expect(controller.getUsage(TENANT_ID)).rejects.toThrow('DB error');
    });
  });
});

// ---------------------------------------------------------------------------
// SubscriptionAdminController
// ---------------------------------------------------------------------------

describe('SubscriptionAdminController', () => {
  let controller: SubscriptionAdminController;
  let service: {
    findByTenantId: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findByTenantId: jest.fn().mockResolvedValue(mockSubscription),
      upsert: jest.fn().mockResolvedValue(mockSubscription),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionAdminController],
      providers: [{ provide: SubscriptionsService, useValue: service }],
    }).compile();

    controller = module.get<SubscriptionAdminController>(
      SubscriptionAdminController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByTenant', () => {
    it('returns subscription for the given tenant', async () => {
      const result = await controller.findByTenant(TENANT_ID);

      expect(result).toEqual(mockSubscription);
      expect(service.findByTenantId).toHaveBeenCalledWith(TENANT_ID);
    });

    it('returns null when tenant has no subscription', async () => {
      service.findByTenantId.mockResolvedValue(null);

      const result = await controller.findByTenant(TENANT_ID);

      expect(result).toBeNull();
    });

    it('propagates errors from service', async () => {
      service.findByTenantId.mockRejectedValue(new Error('DB error'));

      await expect(controller.findByTenant(TENANT_ID)).rejects.toThrow(
        'DB error',
      );
    });
  });

  describe('upsert', () => {
    it('calls service.upsert with tenantId and dto', async () => {
      const dto: UpsertSubscriptionDto = {
        maxUsers: 20,
        maxBranches: 5,
        maxWorkPosts: 15,
        maxServices: 30,
      };

      await controller.upsert(TENANT_ID, dto);

      expect(service.upsert).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('returns the upserted subscription', async () => {
      const dto: UpsertSubscriptionDto = {
        maxUsers: 20,
        maxBranches: 5,
        maxWorkPosts: 15,
        maxServices: 30,
      };

      const result = await controller.upsert(TENANT_ID, dto);

      expect(result).toEqual(mockSubscription);
    });
  });

  describe('remove', () => {
    it('calls service.delete with tenantId', async () => {
      await controller.remove(TENANT_ID);

      expect(service.delete).toHaveBeenCalledWith(TENANT_ID);
    });

    it('propagates errors from service', async () => {
      service.delete.mockRejectedValue(new Error('Not found'));

      await expect(controller.remove(TENANT_ID)).rejects.toThrow('Not found');
    });
  });
});
