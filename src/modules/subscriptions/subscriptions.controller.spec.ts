import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  SubscriptionStatusController,
  SubscriptionUsageController,
  SubscriptionAdminController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionsRepository } from './subscriptions.repository';
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
// SubscriptionStatusController
// ---------------------------------------------------------------------------

describe('SubscriptionStatusController', () => {
  let controller: SubscriptionStatusController;
  let repo: { findByTenantId: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    repo = { findByTenantId: jest.fn() };
    configService = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionStatusController],
      providers: [
        { provide: SubscriptionsRepository, useValue: repo },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    controller = module.get(SubscriptionStatusController);
  });

  it('returns paymentsEnabled: true when feature is enabled', async () => {
    configService.get.mockReturnValue(true);
    repo.findByTenantId.mockResolvedValue(null);

    const result = await controller.getStatus(TENANT_ID);

    expect(result.paymentsEnabled).toBe(true);
  });

  it('returns paymentsEnabled: false when feature is disabled', async () => {
    configService.get.mockReturnValue(false);
    repo.findByTenantId.mockResolvedValue(null);

    const result = await controller.getStatus(TENANT_ID);

    expect(result.paymentsEnabled).toBe(false);
  });

  it('returns trial data from subscription', async () => {
    configService.get.mockReturnValue(true);
    repo.findByTenantId.mockResolvedValue({
      isTrial: true,
      trialEndsAt: new Date('2026-04-01'),
    });

    const result = await controller.getStatus(TENANT_ID);

    expect(result).toEqual({
      isTrial: true,
      trialEndsAt: '2026-04-01T00:00:00.000Z',
      paymentsEnabled: true,
    });
  });

  it('returns defaults when no subscription found', async () => {
    configService.get.mockReturnValue(false);
    repo.findByTenantId.mockResolvedValue(null);

    const result = await controller.getStatus(TENANT_ID);

    expect(result).toEqual({
      isTrial: false,
      trialEndsAt: null,
      paymentsEnabled: false,
    });
  });
});

// ---------------------------------------------------------------------------
// SubscriptionUsageController
// ---------------------------------------------------------------------------

describe('SubscriptionUsageController', () => {
  let controller: SubscriptionUsageController;
  let limitsService: { getUsage: jest.Mock };
  let subscriptionsService: Record<string, jest.Mock>;

  beforeEach(async () => {
    limitsService = { getUsage: jest.fn().mockResolvedValue(mockUsage) };
    subscriptionsService = {
      getPlanCatalog: jest.fn(),
      createCheckout: jest.fn(),
      changePlan: jest.fn(),
      manageAddon: jest.fn(),
      previewPlanChange: jest.fn(),
      cancelSubscription: jest.fn(),
      reactivateSubscription: jest.fn(),
      getBillingDetails: jest.fn(),
      getTransactionHistory: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionUsageController],
      providers: [
        { provide: SubscriptionLimitsService, useValue: limitsService },
        { provide: SubscriptionsService, useValue: subscriptionsService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(true) },
        },
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

  describe('getPlanCatalog', () => {
    it('calls subscriptionsService.getPlanCatalog', async () => {
      const catalog = { plans: [], addons: [] };
      subscriptionsService.getPlanCatalog.mockResolvedValue(catalog);

      await controller.getPlanCatalog();

      expect(subscriptionsService.getPlanCatalog).toHaveBeenCalledTimes(1);
    });

    it('returns the result from service', async () => {
      const catalog = { plans: [{ tier: 'STARTER' }], addons: [] };
      subscriptionsService.getPlanCatalog.mockResolvedValue(catalog);

      const result = await controller.getPlanCatalog();

      expect(result).toEqual(catalog);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.getPlanCatalog.mockRejectedValue(
        new Error('catalog error'),
      );

      await expect(controller.getPlanCatalog()).rejects.toThrow(
        'catalog error',
      );
    });
  });

  describe('createCheckout', () => {
    const dto = {
      planTier: 'STARTER' as const,
      billingInterval: 'MONTHLY' as const,
    };

    const EMAIL = 'test@example.com';

    it('calls service.createCheckout with tenantId, dto, and email', async () => {
      subscriptionsService.createCheckout.mockResolvedValue({
        transactionId: 'txn-1',
        clientToken: 'tok-1',
      });

      await controller.createCheckout(TENANT_ID, EMAIL, dto);

      expect(subscriptionsService.createCheckout).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
        EMAIL,
      );
    });

    it('returns the result from service', async () => {
      const expected = { transactionId: 'txn-1', clientToken: 'tok-1' };
      subscriptionsService.createCheckout.mockResolvedValue(expected);

      const result = await controller.createCheckout(TENANT_ID, EMAIL, dto);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.createCheckout.mockRejectedValue(
        new Error('checkout error'),
      );

      await expect(
        controller.createCheckout(TENANT_ID, EMAIL, dto),
      ).rejects.toThrow('checkout error');
    });
  });

  describe('changePlan', () => {
    const dto = {
      planTier: 'BUSINESS' as const,
      billingInterval: 'YEARLY' as const,
    };

    it('calls service.changePlan with tenantId and dto', async () => {
      subscriptionsService.changePlan.mockResolvedValue({
        message: 'Plan change initiated.',
      });

      await controller.changePlan(TENANT_ID, dto);

      expect(subscriptionsService.changePlan).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
      );
    });

    it('returns the result from service', async () => {
      const expected = { message: 'Plan change initiated.' };
      subscriptionsService.changePlan.mockResolvedValue(expected);

      const result = await controller.changePlan(TENANT_ID, dto);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.changePlan.mockRejectedValue(
        new Error('change error'),
      );

      await expect(controller.changePlan(TENANT_ID, dto)).rejects.toThrow(
        'change error',
      );
    });
  });

  describe('manageAddon', () => {
    const dto = { resource: 'branches' as const, quantity: 2 };

    it('calls service.manageAddon with tenantId and dto', async () => {
      subscriptionsService.manageAddon.mockResolvedValue({ id: 'sub-1' });

      await controller.manageAddon(TENANT_ID, dto);

      expect(subscriptionsService.manageAddon).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
      );
    });

    it('returns the result from service', async () => {
      const expected = {
        id: 'sub-1',
        addons: [{ resource: 'branches', quantity: 2 }],
      };
      subscriptionsService.manageAddon.mockResolvedValue(expected);

      const result = await controller.manageAddon(TENANT_ID, dto);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.manageAddon.mockRejectedValue(
        new Error('addon error'),
      );

      await expect(controller.manageAddon(TENANT_ID, dto)).rejects.toThrow(
        'addon error',
      );
    });
  });

  describe('previewPlanChange', () => {
    const dto = {
      planTier: 'STARTER' as const,
      billingInterval: 'MONTHLY' as const,
    };

    it('calls service.previewPlanChange with tenantId and dto', async () => {
      subscriptionsService.previewPlanChange.mockResolvedValue({
        amount: '2900',
        currency: 'USD',
        interval: 'MONTHLY',
      });

      await controller.previewPlanChange(TENANT_ID, dto);

      expect(subscriptionsService.previewPlanChange).toHaveBeenCalledWith(
        TENANT_ID,
        dto,
      );
    });

    it('returns the result from service', async () => {
      const expected = { amount: '2900', currency: 'USD', interval: 'MONTHLY' };
      subscriptionsService.previewPlanChange.mockResolvedValue(expected);

      const result = await controller.previewPlanChange(TENANT_ID, dto);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.previewPlanChange.mockRejectedValue(
        new Error('preview error'),
      );

      await expect(
        controller.previewPlanChange(TENANT_ID, dto),
      ).rejects.toThrow('preview error');
    });
  });

  describe('cancelSubscription', () => {
    it('calls service.cancelSubscription with tenantId', async () => {
      subscriptionsService.cancelSubscription.mockResolvedValue({
        message: 'Cancellation requested.',
      });

      await controller.cancelSubscription(TENANT_ID);

      expect(subscriptionsService.cancelSubscription).toHaveBeenCalledWith(
        TENANT_ID,
      );
    });

    it('returns the result from service', async () => {
      const expected = { message: 'Cancellation requested.' };
      subscriptionsService.cancelSubscription.mockResolvedValue(expected);

      const result = await controller.cancelSubscription(TENANT_ID);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.cancelSubscription.mockRejectedValue(
        new Error('cancel error'),
      );

      await expect(controller.cancelSubscription(TENANT_ID)).rejects.toThrow(
        'cancel error',
      );
    });
  });

  describe('reactivateSubscription', () => {
    it('delegates to service.reactivateSubscription with tenantId', async () => {
      subscriptionsService.reactivateSubscription.mockResolvedValue({
        message: 'Subscription reactivated successfully.',
      });

      await controller.reactivateSubscription(TENANT_ID);

      expect(subscriptionsService.reactivateSubscription).toHaveBeenCalledWith(
        TENANT_ID,
      );
    });

    it('returns the result from service', async () => {
      const expected = { message: 'Subscription reactivated successfully.' };
      subscriptionsService.reactivateSubscription.mockResolvedValue(expected);

      const result = await controller.reactivateSubscription(TENANT_ID);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.reactivateSubscription.mockRejectedValue(
        new Error('reactivate error'),
      );

      await expect(
        controller.reactivateSubscription(TENANT_ID),
      ).rejects.toThrow('reactivate error');
    });
  });

  describe('getBilling', () => {
    it('delegates to service.getBillingDetails with tenantId', async () => {
      subscriptionsService.getBillingDetails.mockResolvedValue({
        currencyCode: 'USD',
        totalCents: '7900',
      });

      await controller.getBilling(TENANT_ID);

      expect(subscriptionsService.getBillingDetails).toHaveBeenCalledWith(
        TENANT_ID,
      );
    });

    it('returns the result from service', async () => {
      const expected = { currencyCode: 'USD', totalCents: '7900' };
      subscriptionsService.getBillingDetails.mockResolvedValue(expected);

      const result = await controller.getBilling(TENANT_ID);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.getBillingDetails.mockRejectedValue(
        new Error('billing error'),
      );

      await expect(controller.getBilling(TENANT_ID)).rejects.toThrow(
        'billing error',
      );
    });
  });

  describe('getTransactions', () => {
    it('delegates to service.getTransactionHistory with tenantId', async () => {
      subscriptionsService.getTransactionHistory.mockResolvedValue([]);

      await controller.getTransactions(TENANT_ID);

      expect(subscriptionsService.getTransactionHistory).toHaveBeenCalledWith(
        TENANT_ID,
      );
    });

    it('returns the result from service', async () => {
      const expected = [{ id: 'txn-001', status: 'completed' }];
      subscriptionsService.getTransactionHistory.mockResolvedValue(expected);

      const result = await controller.getTransactions(TENANT_ID);

      expect(result).toEqual(expected);
    });

    it('propagates errors from service', async () => {
      subscriptionsService.getTransactionHistory.mockRejectedValue(
        new Error('transactions error'),
      );

      await expect(controller.getTransactions(TENANT_ID)).rejects.toThrow(
        'transactions error',
      );
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
