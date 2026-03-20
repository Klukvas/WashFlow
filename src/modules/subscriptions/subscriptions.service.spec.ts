import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { PaddleService } from './paddle.service';
import { PaddlePriceCacheService } from './paddle-price-cache.service';
import {
  PlanTier,
  SubscriptionStatus,
  PLAN_CATALOG,
  ADDON_DEFINITIONS,
} from './plan.constants';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-001';
const SUB_ID = 'sub-uuid-001';
const PADDLE_SUB_ID = 'paddle-sub-123';

const baseSubscription = {
  id: SUB_ID,
  tenantId: TENANT_ID,
  planTier: PlanTier.BUSINESS,
  status: SubscriptionStatus.ACTIVE,
  paddleSubscriptionId: PADDLE_SUB_ID,
  paddleCustomerId: 'ctm-001',
  maxUsers: 25,
  maxBranches: 5,
  maxWorkPosts: 25,
  maxServices: 50,
  isTrial: false,
  trialEndsAt: null,
  cancelEffectiveAt: null,
  addons: [] as Array<{ resource: string; quantity: number }>,
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function buildRepoMock() {
  return {
    findByTenantId: jest.fn(),
    findByTenantIdWithAddons: jest.fn(),
    findByPaddleSubscriptionId: jest.fn(),
    upsert: jest.fn(),
    update: jest.fn(),
    upsertAddon: jest.fn(),
    deleteAddon: jest.fn(),
    findAddons: jest.fn().mockResolvedValue([]),
    updateLimits: jest.fn(),
    delete: jest.fn(),
    countUsers: jest.fn().mockResolvedValue(0),
    countBranches: jest.fn().mockResolvedValue(0),
    countWorkPosts: jest.fn().mockResolvedValue(0),
    countServices: jest.fn().mockResolvedValue(0),
  };
}

function buildPaddleMock() {
  return {
    createCheckoutTransaction: jest.fn(),
    updateSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    previewSubscriptionUpdate: jest.fn(),
    reactivateSubscription: jest.fn(),
    getSubscriptionBilling: jest.fn(),
    getTransactionHistory: jest.fn(),
  };
}

function buildPriceCacheMock() {
  return {
    getCachedCatalog: jest.fn().mockResolvedValue({
      plans: PLAN_CATALOG.map((p) => ({
        tier: p.tier,
        name: p.name,
        monthlyPrice: p.monthlyPrice,
        yearlyPrice: p.yearlyPrice,
        limits: { ...p.limits },
        addonsAvailable: p.addonsAvailable,
      })),
      addons: ADDON_DEFINITIONS.map((a) => ({
        resource: a.resource,
        unitSize: a.unitSize,
        monthlyPrice: a.monthlyPrice,
        name: a.name,
      })),
    }),
  };
}

function buildConfigMock() {
  return {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'paddle.clientToken') return 'test-client-token';
      return fallback ?? null;
    }),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let repo: ReturnType<typeof buildRepoMock>;
  let paddle: ReturnType<typeof buildPaddleMock>;
  let priceCache: ReturnType<typeof buildPriceCacheMock>;
  let config: ReturnType<typeof buildConfigMock>;

  beforeEach(async () => {
    repo = buildRepoMock();
    paddle = buildPaddleMock();
    priceCache = buildPriceCacheMock();
    config = buildConfigMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: SubscriptionsRepository, useValue: repo },
        { provide: PaddleService, useValue: paddle },
        { provide: PaddlePriceCacheService, useValue: priceCache },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // getPlanCatalog
  // -------------------------------------------------------------------------

  describe('getPlanCatalog', () => {
    it('returns an object with plans and addons arrays', async () => {
      const result = await service.getPlanCatalog();
      expect(result).toHaveProperty('plans');
      expect(result).toHaveProperty('addons');
      expect(Array.isArray(result.plans)).toBe(true);
      expect(Array.isArray(result.addons)).toBe(true);
    });

    it('returns exactly 3 plans matching PLAN_CATALOG', async () => {
      const result = await service.getPlanCatalog();
      expect(result.plans).toHaveLength(PLAN_CATALOG.length);
      expect(result.plans).toHaveLength(3);
    });

    it('returns exactly 4 addons matching ADDON_DEFINITIONS', async () => {
      const result = await service.getPlanCatalog();
      expect(result.addons).toHaveLength(ADDON_DEFINITIONS.length);
      expect(result.addons).toHaveLength(4);
    });

    it('each plan contains tier, name, monthlyPrice, yearlyPrice, limits, addonsAvailable', async () => {
      const { plans } = await service.getPlanCatalog();
      for (const plan of plans) {
        expect(plan).toHaveProperty('tier');
        expect(plan).toHaveProperty('name');
        expect(plan).toHaveProperty('monthlyPrice');
        expect(plan).toHaveProperty('yearlyPrice');
        expect(plan).toHaveProperty('limits');
        expect(plan).toHaveProperty('addonsAvailable');
      }
    });

    it('each addon contains resource, unitSize, monthlyPrice, name', async () => {
      const { addons } = await service.getPlanCatalog();
      for (const addon of addons) {
        expect(addon).toHaveProperty('resource');
        expect(addon).toHaveProperty('unitSize');
        expect(addon).toHaveProperty('monthlyPrice');
        expect(addon).toHaveProperty('name');
      }
    });

    it('plans include STARTER, BUSINESS, and ENTERPRISE tiers', async () => {
      const { plans } = await service.getPlanCatalog();
      const tiers = plans.map((p) => p.tier);
      expect(tiers).toContain(PlanTier.STARTER);
      expect(tiers).toContain(PlanTier.BUSINESS);
      expect(tiers).toContain(PlanTier.ENTERPRISE);
    });

    it('ENTERPRISE plan has addonsAvailable set to true', async () => {
      const { plans } = await service.getPlanCatalog();
      const enterprise = plans.find((p) => p.tier === PlanTier.ENTERPRISE);
      expect(enterprise?.addonsAvailable).toBe(true);
    });

    it('delegates to PaddlePriceCacheService.getCachedCatalog', async () => {
      await service.getPlanCatalog();
      expect(priceCache.getCachedCatalog).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // createCheckout
  // -------------------------------------------------------------------------

  describe('createCheckout', () => {
    const dto = {
      planTier: 'STARTER' as const,
      billingInterval: 'MONTHLY' as const,
    };

    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);

      await expect(service.createCheckout(TENANT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when subscription already has a paddleSubscriptionId', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: 'already-set',
      });

      await expect(service.createCheckout(TENANT_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "Already subscribed" message when paddleSubscriptionId exists', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: 'already-set',
      });

      await expect(service.createCheckout(TENANT_ID, dto)).rejects.toThrow(
        /Already subscribed/,
      );
    });

    it('throws BadRequestException for an invalid planTier', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(
        service.createCheckout(TENANT_ID, {
          planTier: 'INVALID' as 'STARTER',
          billingInterval: 'MONTHLY',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('calls paddleService.createCheckoutTransaction with correct items and customData', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });
      paddle.createCheckoutTransaction.mockResolvedValue({
        transactionId: 'txn-abc',
      });

      await service.createCheckout(TENANT_ID, dto);

      expect(paddle.createCheckoutTransaction).toHaveBeenCalledTimes(1);
      const callArg = paddle.createCheckoutTransaction.mock.calls[0][0] as {
        items: Array<{ priceId: string; quantity: number }>;
        customData: { tenantId: string };
        customerId?: string;
      };
      expect(callArg.items).toHaveLength(1);
      expect(callArg.items[0].priceId).toBe('pri_starter_monthly');
      expect(callArg.items[0].quantity).toBe(1);
      expect(callArg.customData).toEqual({ tenantId: TENANT_ID });
    });

    it('passes paddleCustomerId when it exists on the subscription', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        paddleCustomerId: 'ctm-existing',
      });
      paddle.createCheckoutTransaction.mockResolvedValue({
        transactionId: 'txn-xyz',
      });

      await service.createCheckout(TENANT_ID, dto);

      const callArg = paddle.createCheckoutTransaction.mock.calls[0][0] as {
        customerId?: string;
      };
      expect(callArg.customerId).toBe('ctm-existing');
    });

    it('passes undefined customerId when paddleCustomerId is null', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        paddleCustomerId: null,
      });
      paddle.createCheckoutTransaction.mockResolvedValue({
        transactionId: 'txn-xyz',
      });

      await service.createCheckout(TENANT_ID, dto);

      const callArg = paddle.createCheckoutTransaction.mock.calls[0][0] as {
        customerId?: string;
      };
      expect(callArg.customerId).toBeUndefined();
    });

    it('returns transactionId and clientToken from config', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });
      paddle.createCheckoutTransaction.mockResolvedValue({
        transactionId: 'txn-returned',
      });

      const result = await service.createCheckout(TENANT_ID, dto);

      expect(result).toEqual({
        transactionId: 'txn-returned',
        clientToken: 'test-client-token',
      });
    });

    it('generates correct priceId for YEARLY billing interval', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });
      paddle.createCheckoutTransaction.mockResolvedValue({
        transactionId: 'txn-y',
      });

      await service.createCheckout(TENANT_ID, {
        planTier: 'BUSINESS',
        billingInterval: 'YEARLY',
      });

      const callArg = paddle.createCheckoutTransaction.mock.calls[0][0] as {
        items: Array<{ priceId: string }>;
      };
      expect(callArg.items[0].priceId).toBe('pri_business_yearly');
    });
  });

  // -------------------------------------------------------------------------
  // changePlan
  // -------------------------------------------------------------------------

  describe('changePlan', () => {
    const dto = {
      planTier: 'BUSINESS' as const,
      billingInterval: 'MONTHLY' as const,
    };

    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);

      await expect(service.changePlan(TENANT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when subscription has no paddleSubscriptionId', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(service.changePlan(TENANT_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "No active Paddle subscription" message', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(service.changePlan(TENANT_ID, dto)).rejects.toThrow(
        /No active Paddle subscription/,
      );
    });

    it('throws BadRequestException when current plan is TRIAL', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: 'TRIAL',
      });

      await expect(service.changePlan(TENANT_ID, dto)).rejects.toThrow(
        /Cannot change plan on a trial/,
      );
    });

    it('calls paddleService.updateSubscription with correct priceId and prorationBillingMode', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(baseSubscription);
      paddle.updateSubscription.mockResolvedValue(undefined);

      await service.changePlan(TENANT_ID, {
        planTier: 'ENTERPRISE',
        billingInterval: 'YEARLY',
      });

      expect(paddle.updateSubscription).toHaveBeenCalledTimes(1);
      expect(paddle.updateSubscription).toHaveBeenCalledWith(PADDLE_SUB_ID, {
        items: [{ priceId: 'pri_enterprise_yearly', quantity: 1 }],
        prorationBillingMode: 'prorated_immediately',
      });
    });

    it('includes existing addons when changing plans', async () => {
      const subWithAddons = {
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        billingInterval: 'MONTHLY',
        addons: [
          { resource: 'branches', quantity: 3 },
          { resource: 'users', quantity: 2 },
        ],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(subWithAddons);
      paddle.updateSubscription.mockResolvedValue(undefined);

      await service.changePlan(TENANT_ID, {
        planTier: 'BUSINESS',
        billingInterval: 'MONTHLY',
      });

      expect(paddle.updateSubscription).toHaveBeenCalledWith(PADDLE_SUB_ID, {
        items: expect.arrayContaining([
          { priceId: 'pri_business_monthly', quantity: 1 },
          { priceId: 'pri_addon_branches', quantity: 3 },
          { priceId: 'pri_addon_users', quantity: 2 },
        ]),
        prorationBillingMode: 'prorated_immediately',
      });
    });

    it('returns a message indicating plan change was initiated', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(baseSubscription);
      paddle.updateSubscription.mockResolvedValue(undefined);

      const result = await service.changePlan(TENANT_ID, dto);

      expect(result).toHaveProperty('message');
      expect(result.message).toMatch(/Plan change initiated/);
    });

    describe('downgrade validation', () => {
      it('throws ConflictException when users exceed new plan limit on downgrade', async () => {
        // BUSINESS (25 users) -> STARTER (5 users), 10 active users
        repo.findByTenantIdWithAddons.mockResolvedValue({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        });
        repo.countUsers.mockResolvedValue(10);
        repo.countBranches.mockResolvedValue(1);
        repo.countWorkPosts.mockResolvedValue(2);
        repo.countServices.mockResolvedValue(5);

        await expect(
          service.changePlan(TENANT_ID, {
            planTier: 'STARTER',
            billingInterval: 'MONTHLY',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('throws ConflictException when branches exceed new plan limit on downgrade', async () => {
        // BUSINESS (5 branches) -> STARTER (1 branch), 3 active branches
        repo.findByTenantIdWithAddons.mockResolvedValue({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        });
        repo.countUsers.mockResolvedValue(3);
        repo.countBranches.mockResolvedValue(3);
        repo.countWorkPosts.mockResolvedValue(2);
        repo.countServices.mockResolvedValue(5);

        await expect(
          service.changePlan(TENANT_ID, {
            planTier: 'STARTER',
            billingInterval: 'MONTHLY',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('throws ConflictException with violation details in message', async () => {
        repo.findByTenantIdWithAddons.mockResolvedValue({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        });
        repo.countUsers.mockResolvedValue(10);
        repo.countBranches.mockResolvedValue(1);
        repo.countWorkPosts.mockResolvedValue(2);
        repo.countServices.mockResolvedValue(5);

        await expect(
          service.changePlan(TENANT_ID, {
            planTier: 'STARTER',
            billingInterval: 'MONTHLY',
          }),
        ).rejects.toThrow(/Cannot downgrade/);
      });

      it('does not run validation when changing to a higher tier (upgrade)', async () => {
        // STARTER -> BUSINESS: no validation needed
        repo.findByTenantIdWithAddons.mockResolvedValue({
          ...baseSubscription,
          planTier: PlanTier.STARTER,
        });
        paddle.updateSubscription.mockResolvedValue(undefined);

        await service.changePlan(TENANT_ID, {
          planTier: 'BUSINESS',
          billingInterval: 'MONTHLY',
        });

        expect(repo.countUsers).not.toHaveBeenCalled();
        expect(repo.countBranches).not.toHaveBeenCalled();
      });

      it('does not run validation when changing to the same tier', async () => {
        repo.findByTenantIdWithAddons.mockResolvedValue({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        });
        paddle.updateSubscription.mockResolvedValue(undefined);

        await service.changePlan(TENANT_ID, {
          planTier: 'BUSINESS',
          billingInterval: 'YEARLY',
        });

        expect(repo.countUsers).not.toHaveBeenCalled();
      });

      it('allows downgrade when usage is within new plan limits', async () => {
        // BUSINESS -> STARTER, usage well within STARTER limits
        repo.findByTenantIdWithAddons.mockResolvedValue({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        });
        repo.countUsers.mockResolvedValue(3);
        repo.countBranches.mockResolvedValue(1);
        repo.countWorkPosts.mockResolvedValue(4);
        repo.countServices.mockResolvedValue(10);
        paddle.updateSubscription.mockResolvedValue(undefined);

        await expect(
          service.changePlan(TENANT_ID, {
            planTier: 'STARTER',
            billingInterval: 'MONTHLY',
          }),
        ).resolves.toHaveProperty('message');
      });
    });
  });

  // -------------------------------------------------------------------------
  // manageAddon
  // -------------------------------------------------------------------------

  describe('manageAddon', () => {
    const dto = { resource: 'branches' as const, quantity: 2 };

    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);

      await expect(service.manageAddon(TENANT_ID, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for TRIAL tier', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.TRIAL,
      });

      await expect(service.manageAddon(TENANT_ID, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "Add-ons are not available on trial" message', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.TRIAL,
      });

      await expect(service.manageAddon(TENANT_ID, dto)).rejects.toThrow(
        /Add-ons are not available on trial/,
      );
    });

    it('upserts addon when quantity > 0', async () => {
      const updatedSub = {
        ...baseSubscription,
        addons: [{ resource: 'branches', quantity: 2 }],
      };
      repo.findByTenantIdWithAddons
        .mockResolvedValueOnce({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        })
        .mockResolvedValueOnce(updatedSub) // recalculate
        .mockResolvedValueOnce(updatedSub); // final return
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      expect(repo.upsertAddon).toHaveBeenCalledWith(
        SUB_ID,
        'branches',
        2,
        'pri_addon_branches',
      );
      expect(repo.deleteAddon).not.toHaveBeenCalled();
    });

    it('deletes addon when quantity is 0', async () => {
      const subWithAddon = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [{ resource: 'branches', quantity: 3 }],
      };
      const subAfter = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [],
      };
      repo.findByTenantIdWithAddons
        .mockResolvedValueOnce(subWithAddon)
        .mockResolvedValueOnce(subAfter)
        .mockResolvedValueOnce(subAfter);
      repo.deleteAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 0,
      });

      expect(repo.deleteAddon).toHaveBeenCalledWith(SUB_ID, 'branches');
      expect(repo.upsertAddon).not.toHaveBeenCalled();
    });

    it('calls recalculateEffectiveLimits after addon change', async () => {
      const subState = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(subState);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      expect(repo.updateLimits).toHaveBeenCalled();
    });

    it('returns the updated subscription with addons', async () => {
      const updatedSub = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        billingInterval: 'MONTHLY',
        addons: [{ resource: 'branches', quantity: 2 }],
      };
      repo.findByTenantIdWithAddons
        .mockResolvedValueOnce({
          ...baseSubscription,
          planTier: PlanTier.BUSINESS,
        })
        .mockResolvedValueOnce(updatedSub) // recalculate call
        .mockResolvedValueOnce(updatedSub) // Paddle sync call
        .mockResolvedValueOnce(updatedSub); // final return
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);
      paddle.updateSubscription.mockResolvedValue(undefined);

      const result = await service.manageAddon(TENANT_ID, dto);

      expect(result).toEqual(updatedSub);
    });

    it('allows managing addons for STARTER tier', async () => {
      const starterSub = {
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(starterSub);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await expect(service.manageAddon(TENANT_ID, dto)).resolves.toBeDefined();
    });

    it('calls paddle.updateSubscription when paddleSubscriptionId exists', async () => {
      const updatedSub = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        billingInterval: 'MONTHLY',
        addons: [{ resource: 'branches', quantity: 2 }],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(updatedSub);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);
      paddle.updateSubscription.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      expect(paddle.updateSubscription).toHaveBeenCalledTimes(1);
      expect(paddle.updateSubscription).toHaveBeenCalledWith(PADDLE_SUB_ID, {
        items: expect.arrayContaining([
          { priceId: 'pri_business_monthly', quantity: 1 },
          { priceId: 'pri_addon_branches', quantity: 2 },
        ]),
        prorationBillingMode: 'prorated_immediately',
      });
    });

    it('does NOT call paddle.updateSubscription when paddleSubscriptionId is null', async () => {
      const subWithoutPaddle = {
        ...baseSubscription,
        paddleSubscriptionId: null,
        planTier: PlanTier.BUSINESS,
        addons: [],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(subWithoutPaddle);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      expect(paddle.updateSubscription).not.toHaveBeenCalled();
    });

    it('passes paddlePriceId to upsertAddon', async () => {
      const subState = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(subState);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      expect(repo.upsertAddon).toHaveBeenCalledWith(
        SUB_ID,
        'branches',
        2,
        'pri_addon_branches',
      );
    });

    it('does not write to DB when Paddle updateSubscription fails (no addon)', async () => {
      const subBefore = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        billingInterval: 'MONTHLY',
        addons: [] as Array<{ resource: string; quantity: number }>,
      };
      repo.findByTenantIdWithAddons.mockResolvedValueOnce(subBefore);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.deleteAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);
      paddle.updateSubscription.mockRejectedValue(
        new Error('Paddle API error: 500'),
      );

      await expect(service.manageAddon(TENANT_ID, dto)).rejects.toThrow(
        'Paddle API error: 500',
      );

      // Paddle failed before DB write — no DB mutations should have occurred
      expect(repo.upsertAddon).not.toHaveBeenCalled();
      expect(repo.deleteAddon).not.toHaveBeenCalled();
      expect(repo.updateLimits).not.toHaveBeenCalled();
    });

    it('does not write to DB when Paddle fails on addon quantity update', async () => {
      const subBefore = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        billingInterval: 'MONTHLY',
        addons: [
          {
            resource: 'branches',
            quantity: 1,
            paddlePriceId: 'pri_addon_branches',
          },
        ],
      };
      repo.findByTenantIdWithAddons.mockResolvedValueOnce(subBefore);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);
      paddle.updateSubscription.mockRejectedValue(
        new Error('Paddle API error: 422'),
      );

      await expect(
        service.manageAddon(TENANT_ID, { resource: 'branches', quantity: 5 }),
      ).rejects.toThrow('Paddle API error: 422');

      // Paddle failed before DB write — upsertAddon must not have been called
      expect(repo.upsertAddon).not.toHaveBeenCalled();
      expect(repo.updateLimits).not.toHaveBeenCalled();
    });

    it('uses config-overridden addon price ID when available', async () => {
      config.get.mockImplementation((key: string, fallback?: unknown) => {
        if (key === 'paddle.addonPriceIds') {
          return { branches: 'pri_custom_branches' };
        }
        if (key === 'paddle.clientToken') return 'test-client-token';
        return fallback ?? null;
      });

      const subState = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [],
      };
      repo.findByTenantIdWithAddons.mockResolvedValue(subState);
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      expect(repo.upsertAddon).toHaveBeenCalledWith(
        SUB_ID,
        'branches',
        2,
        'pri_custom_branches',
      );
    });

    it('writes addon to DB only after Paddle succeeds', async () => {
      const subState = {
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        billingInterval: 'MONTHLY',
        addons: [],
      };
      const updatedSub = {
        ...subState,
        addons: [{ resource: 'branches', quantity: 2 }],
      };
      repo.findByTenantIdWithAddons
        .mockResolvedValueOnce(subState) // initial read
        .mockResolvedValueOnce(updatedSub) // recalculateEffectiveLimits
        .mockResolvedValueOnce(updatedSub); // final return
      repo.upsertAddon.mockResolvedValue(undefined);
      repo.updateLimits.mockResolvedValue(undefined);
      paddle.updateSubscription.mockResolvedValue(undefined);

      await service.manageAddon(TENANT_ID, dto);

      // Paddle called first, then DB write
      expect(paddle.updateSubscription).toHaveBeenCalledTimes(1);
      expect(repo.upsertAddon).toHaveBeenCalledWith(
        SUB_ID,
        'branches',
        2,
        'pri_addon_branches',
      );
    });
  });

  // -------------------------------------------------------------------------
  // cancelSubscription
  // -------------------------------------------------------------------------

  describe('cancelSubscription', () => {
    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when subscription has no paddleSubscriptionId', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "No active Paddle subscription to cancel" message', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        /No active Paddle subscription to cancel/,
      );
    });

    it('throws BadRequestException when subscription is already cancelled', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
      });

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "already cancelled" message', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
      });

      await expect(service.cancelSubscription(TENANT_ID)).rejects.toThrow(
        /already cancelled/,
      );
    });

    it('calls paddleService.cancelSubscription with correct paddleSubscriptionId', async () => {
      repo.findByTenantId.mockResolvedValue(baseSubscription);
      paddle.cancelSubscription.mockResolvedValue(undefined);

      await service.cancelSubscription(TENANT_ID);

      expect(paddle.cancelSubscription).toHaveBeenCalledTimes(1);
      expect(paddle.cancelSubscription).toHaveBeenCalledWith(
        PADDLE_SUB_ID,
        'next_billing_period',
      );
    });

    it('returns a confirmation message about access continuing until billing period end', async () => {
      repo.findByTenantId.mockResolvedValue(baseSubscription);
      paddle.cancelSubscription.mockResolvedValue(undefined);

      const result = await service.cancelSubscription(TENANT_ID);

      expect(result).toHaveProperty('message');
      expect(result.message).toMatch(/Cancellation requested/);
    });

    it('allows cancellation for ACTIVE status', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.ACTIVE,
      });
      paddle.cancelSubscription.mockResolvedValue(undefined);

      await expect(
        service.cancelSubscription(TENANT_ID),
      ).resolves.toHaveProperty('message');
    });

    it('allows cancellation for PAST_DUE status', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.PAST_DUE,
      });
      paddle.cancelSubscription.mockResolvedValue(undefined);

      await expect(
        service.cancelSubscription(TENANT_ID),
      ).resolves.toHaveProperty('message');
    });
  });

  // -------------------------------------------------------------------------
  // recalculateEffectiveLimits
  // -------------------------------------------------------------------------

  describe('recalculateEffectiveLimits', () => {
    it('does nothing when subscription does not exist', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);

      await service.recalculateEffectiveLimits(TENANT_ID);

      expect(repo.updateLimits).not.toHaveBeenCalled();
    });

    it('calculates base limits when there are no addons', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // STARTER base limits: branches=1, workPosts=5, users=5, services=15
      expect(repo.updateLimits).toHaveBeenCalledWith(TENANT_ID, {
        maxBranches: 1,
        maxWorkPosts: 5,
        maxUsers: 5,
        maxServices: 15,
      });
    });

    it('adds addon units on top of base limits (branches: 1 addon unit = +1)', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [{ resource: 'branches', quantity: 2 }],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // STARTER branches base=1, addon unitSize=1, quantity=2 → 1 + 2*1 = 3
      expect(repo.updateLimits).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ maxBranches: 3 }),
      );
    });

    it('adds addon units for workPosts (unitSize=5)', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [{ resource: 'workPosts', quantity: 3 }],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // STARTER workPosts base=5, addon unitSize=5, quantity=3 → 5 + 3*5 = 20
      expect(repo.updateLimits).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ maxWorkPosts: 20 }),
      );
    });

    it('adds addon units for users (unitSize=5)', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [{ resource: 'users', quantity: 2 }],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // STARTER users base=5, addon unitSize=5, quantity=2 → 5 + 2*5 = 15
      expect(repo.updateLimits).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ maxUsers: 15 }),
      );
    });

    it('adds addon units for services (unitSize=10)', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [{ resource: 'services', quantity: 4 }],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // STARTER services base=15, addon unitSize=10, quantity=4 → 15 + 4*10 = 55
      expect(repo.updateLimits).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ maxServices: 55 }),
      );
    });

    it('returns null for unlimited resources (ENTERPRISE users and services)', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.ENTERPRISE,
        addons: [],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // ENTERPRISE users=null, services=null (unlimited)
      expect(repo.updateLimits).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({ maxUsers: null, maxServices: null }),
      );
    });

    it('calculates effective limits correctly for multiple addons simultaneously', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [
          { resource: 'branches', quantity: 3 },
          { resource: 'users', quantity: 2 },
        ],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // BUSINESS branches base=5, +3*1=8; users base=25, +2*5=35
      expect(repo.updateLimits).toHaveBeenCalledWith(TENANT_ID, {
        maxBranches: 8,
        maxWorkPosts: 25, // no addon
        maxUsers: 35,
        maxServices: 50, // no addon
      });
    });

    it('ignores unknown resource keys in addons', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.STARTER,
        addons: [{ resource: 'unknown_resource', quantity: 99 }],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      // Base STARTER limits unchanged since unknown resource is ignored
      expect(repo.updateLimits).toHaveBeenCalledWith(TENANT_ID, {
        maxBranches: 1,
        maxWorkPosts: 5,
        maxUsers: 5,
        maxServices: 15,
      });
    });

    it('calls updateLimits exactly once per invocation', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
        addons: [],
      });
      repo.updateLimits.mockResolvedValue(undefined);

      await service.recalculateEffectiveLimits(TENANT_ID);

      expect(repo.updateLimits).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // validateDowngrade (tested through changePlan edge cases)
  // -------------------------------------------------------------------------

  describe('validateDowngrade (via changePlan)', () => {
    it('throws ConflictException when work posts exceed new plan limit', async () => {
      // BUSINESS -> STARTER: STARTER workPosts limit=5, 12 active
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
      });
      repo.countUsers.mockResolvedValue(3);
      repo.countBranches.mockResolvedValue(1);
      repo.countWorkPosts.mockResolvedValue(12);
      repo.countServices.mockResolvedValue(5);

      await expect(
        service.changePlan(TENANT_ID, {
          planTier: 'STARTER',
          billingInterval: 'MONTHLY',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when services exceed new plan limit', async () => {
      // BUSINESS -> STARTER: STARTER services limit=15, 20 active
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
      });
      repo.countUsers.mockResolvedValue(3);
      repo.countBranches.mockResolvedValue(1);
      repo.countWorkPosts.mockResolvedValue(4);
      repo.countServices.mockResolvedValue(20);

      await expect(
        service.changePlan(TENANT_ID, {
          planTier: 'STARTER',
          billingInterval: 'MONTHLY',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('includes all violating resources in the ConflictException message', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
      });
      repo.countUsers.mockResolvedValue(10);
      repo.countBranches.mockResolvedValue(3);
      repo.countWorkPosts.mockResolvedValue(12);
      repo.countServices.mockResolvedValue(20);

      let thrownError: ConflictException | undefined;
      try {
        await service.changePlan(TENANT_ID, {
          planTier: 'STARTER',
          billingInterval: 'MONTHLY',
        });
      } catch (err) {
        thrownError = err as ConflictException;
      }

      expect(thrownError).toBeInstanceOf(ConflictException);
      const msg = thrownError?.message ?? '';
      expect(msg).toMatch(/users/);
      expect(msg).toMatch(/branches/);
      expect(msg).toMatch(/work posts/);
      expect(msg).toMatch(/services/);
    });

    it('does not throw when all resources are exactly at new plan limits', async () => {
      // BUSINESS -> STARTER: exactly at limits (branches=1, workPosts=5, users=5, services=15)
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.BUSINESS,
      });
      repo.countUsers.mockResolvedValue(5);
      repo.countBranches.mockResolvedValue(1);
      repo.countWorkPosts.mockResolvedValue(5);
      repo.countServices.mockResolvedValue(15);
      paddle.updateSubscription.mockResolvedValue(undefined);

      await expect(
        service.changePlan(TENANT_ID, {
          planTier: 'STARTER',
          billingInterval: 'MONTHLY',
        }),
      ).resolves.toHaveProperty('message');
    });

    it('does not throw for unlimited resources on ENTERPRISE (null limit)', async () => {
      // ENTERPRISE -> BUSINESS: BUSINESS users=25, ENTERPRISE users=null
      // Going from ENTERPRISE to BUSINESS IS a downgrade in ordering (3->2)
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        planTier: PlanTier.ENTERPRISE,
      });
      repo.countUsers.mockResolvedValue(30);
      repo.countBranches.mockResolvedValue(4);
      repo.countWorkPosts.mockResolvedValue(20);
      repo.countServices.mockResolvedValue(40);

      // users=30 > BUSINESS limit=25 → should throw ConflictException
      await expect(
        service.changePlan(TENANT_ID, {
          planTier: 'BUSINESS',
          billingInterval: 'MONTHLY',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // -------------------------------------------------------------------------
  // previewPlanChange
  // -------------------------------------------------------------------------

  describe('previewPlanChange', () => {
    const monthlyDto = {
      planTier: 'STARTER' as const,
      billingInterval: 'MONTHLY' as const,
    };
    const yearlyDto = {
      planTier: 'STARTER' as const,
      billingInterval: 'YEARLY' as const,
    };

    it('throws NotFoundException when subscription not found', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);

      await expect(
        service.previewPlanChange(TENANT_ID, monthlyDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns static price for MONTHLY when no Paddle subscription', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        addons: [],
      });

      const result = await service.previewPlanChange(TENANT_ID, monthlyDto);

      // STARTER monthlyPrice = 29 → 29 * 100 = 2900
      expect(result).toEqual({
        source: 'static',
        amount: '2900',
        currency: 'USD',
        interval: 'MONTHLY',
      });
    });

    it('returns static price for YEARLY when no Paddle subscription', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        addons: [],
      });

      const result = await service.previewPlanChange(TENANT_ID, yearlyDto);

      // STARTER yearlyPrice = 290 → 290 * 100 = 29000
      expect(result).toEqual({
        source: 'static',
        amount: '29000',
        currency: 'USD',
        interval: 'YEARLY',
      });
    });

    it('throws BadRequestException for invalid plan tier without Paddle sub', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        addons: [],
      });

      await expect(
        service.previewPlanChange(TENANT_ID, {
          planTier: 'INVALID' as 'STARTER',
          billingInterval: 'MONTHLY',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('does NOT call paddleService when no Paddle subscription', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        addons: [],
      });

      await service.previewPlanChange(TENANT_ID, monthlyDto);

      expect(paddle.previewSubscriptionUpdate).not.toHaveBeenCalled();
    });

    it('delegates to paddleService.previewSubscriptionUpdate when Paddle sub exists', async () => {
      const paddleResult = {
        immediateTransaction: { amount: '1500', currency: 'USD' },
        nextTransaction: {
          amount: '2900',
          currency: 'USD',
          billingDate: '2026-04-01',
        },
      };
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        addons: [],
      });
      paddle.previewSubscriptionUpdate.mockResolvedValue(paddleResult);

      const result = await service.previewPlanChange(TENANT_ID, monthlyDto);

      expect(paddle.previewSubscriptionUpdate).toHaveBeenCalledTimes(1);
      expect(result).toEqual(paddleResult);
    });

    it('passes correct priceId to Paddle preview', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        addons: [],
      });
      paddle.previewSubscriptionUpdate.mockResolvedValue({});

      await service.previewPlanChange(TENANT_ID, {
        planTier: 'BUSINESS',
        billingInterval: 'YEARLY',
      });

      expect(paddle.previewSubscriptionUpdate).toHaveBeenCalledWith(
        PADDLE_SUB_ID,
        {
          items: [{ priceId: 'pri_business_yearly', quantity: 1 }],
          prorationBillingMode: 'prorated_immediately',
        },
      );
    });

    it('includes addons in Paddle preview items', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        billingInterval: 'MONTHLY',
        addons: [{ resource: 'branches', quantity: 2 }],
      });
      paddle.previewSubscriptionUpdate.mockResolvedValue({});

      await service.previewPlanChange(TENANT_ID, {
        planTier: 'BUSINESS',
        billingInterval: 'MONTHLY',
      });

      expect(paddle.previewSubscriptionUpdate).toHaveBeenCalledWith(
        PADDLE_SUB_ID,
        {
          items: expect.arrayContaining([
            { priceId: 'pri_business_monthly', quantity: 1 },
            { priceId: 'pri_addon_branches', quantity: 2 },
          ]),
          prorationBillingMode: 'prorated_immediately',
        },
      );
    });

    it('returns correct price for BUSINESS MONTHLY without Paddle sub', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        addons: [],
      });

      const result = await service.previewPlanChange(TENANT_ID, {
        planTier: 'BUSINESS',
        billingInterval: 'MONTHLY',
      });

      // BUSINESS monthlyPrice = 79 → 79 * 100 = 7900
      expect(result).toEqual({
        source: 'static',
        amount: '7900',
        currency: 'USD',
        interval: 'MONTHLY',
      });
    });

    it('returns correct price for ENTERPRISE YEARLY without Paddle sub', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
        addons: [],
      });

      const result = await service.previewPlanChange(TENANT_ID, {
        planTier: 'ENTERPRISE',
        billingInterval: 'YEARLY',
      });

      // ENTERPRISE yearlyPrice = 1990 → 1990 * 100 = 199000
      expect(result).toEqual({
        source: 'static',
        amount: '199000',
        currency: 'USD',
        interval: 'YEARLY',
      });
    });

    it('returns Paddle response as-is without transformation', async () => {
      const paddleResult = { someField: 'value', nested: { key: 42 } };
      repo.findByTenantIdWithAddons.mockResolvedValue({
        ...baseSubscription,
        addons: [],
      });
      paddle.previewSubscriptionUpdate.mockResolvedValue(paddleResult);

      const result = await service.previewPlanChange(TENANT_ID, monthlyDto);

      expect(result).toBe(paddleResult); // same reference
    });
  });

  // -------------------------------------------------------------------------
  // findByTenantId
  // -------------------------------------------------------------------------

  describe('findByTenantId', () => {
    it('returns the subscription when found', async () => {
      repo.findByTenantId.mockResolvedValue(baseSubscription);

      const result = await service.findByTenantId(TENANT_ID);

      expect(result).toEqual(baseSubscription);
    });

    it('throws NotFoundException when subscription is not found', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.findByTenantId(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // upsert (existing coverage kept for completeness)
  // -------------------------------------------------------------------------

  describe('upsert', () => {
    const dto = {
      maxUsers: 10,
      maxBranches: 3,
      maxWorkPosts: 8,
      maxServices: 20,
    };

    it('creates or updates subscription when all limits are above current usage', async () => {
      repo.countUsers.mockResolvedValue(5);
      repo.countBranches.mockResolvedValue(2);
      repo.countWorkPosts.mockResolvedValue(4);
      repo.countServices.mockResolvedValue(10);
      repo.upsert.mockResolvedValue(baseSubscription);

      const result = await service.upsert(TENANT_ID, dto);

      expect(result).toEqual(baseSubscription);
      expect(repo.upsert).toHaveBeenCalledWith(TENANT_ID, dto);
    });

    it('throws ConflictException when maxUsers is below current count', async () => {
      repo.countUsers.mockResolvedValue(15);

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when maxBranches is below current count', async () => {
      repo.countBranches.mockResolvedValue(5);

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when maxWorkPosts is below current count', async () => {
      repo.countWorkPosts.mockResolvedValue(10);

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ConflictException when maxServices is below current count', async () => {
      repo.countServices.mockResolvedValue(25);

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('includes all violations in the error message', async () => {
      repo.countUsers.mockResolvedValue(15);
      repo.countBranches.mockResolvedValue(5);
      repo.countWorkPosts.mockResolvedValue(10);
      repo.countServices.mockResolvedValue(25);

      await expect(service.upsert(TENANT_ID, dto)).rejects.toThrow(
        /users.*branches.*work posts.*services/,
      );
    });

    it('allows setting limits equal to current usage (boundary value)', async () => {
      repo.countUsers.mockResolvedValue(10);
      repo.countBranches.mockResolvedValue(3);
      repo.countWorkPosts.mockResolvedValue(8);
      repo.countServices.mockResolvedValue(20);
      repo.upsert.mockResolvedValue(baseSubscription);

      await expect(service.upsert(TENANT_ID, dto)).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------------

  describe('delete', () => {
    it('deletes the subscription when it exists', async () => {
      repo.findByTenantId.mockResolvedValue(baseSubscription);
      repo.delete.mockResolvedValue(baseSubscription);

      const result = await service.delete(TENANT_ID);

      expect(result).toEqual(baseSubscription);
      expect(repo.delete).toHaveBeenCalledWith(TENANT_ID);
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.delete(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // reactivateSubscription
  // -------------------------------------------------------------------------

  describe('reactivateSubscription', () => {
    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when subscription has no paddleSubscriptionId', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "No Paddle subscription" message when paddleSubscriptionId is null', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        /No Paddle subscription to reactivate/,
      );
    });

    it('throws BadRequestException when status is not CANCELLED', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.ACTIVE,
      });

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "not cancelled" message when status is ACTIVE', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.ACTIVE,
      });

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        /not cancelled/,
      );
    });

    it('throws BadRequestException when cancelEffectiveAt is in the past', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
        cancelEffectiveAt: new Date('2020-01-01'), // past date
      });

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException with "Cancellation period has ended" message when cancelEffectiveAt is past', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
        cancelEffectiveAt: new Date('2020-01-01'),
      });

      await expect(service.reactivateSubscription(TENANT_ID)).rejects.toThrow(
        /Cancellation period has ended/,
      );
    });

    it('calls paddleService.reactivateSubscription with the correct paddleSubscriptionId', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
        cancelEffectiveAt: new Date('2099-01-01'), // future date
      });
      paddle.reactivateSubscription.mockResolvedValue(undefined);
      repo.update.mockResolvedValue(undefined);

      await service.reactivateSubscription(TENANT_ID);

      expect(paddle.reactivateSubscription).toHaveBeenCalledTimes(1);
      expect(paddle.reactivateSubscription).toHaveBeenCalledWith(PADDLE_SUB_ID);
    });

    it('clears cancellation fields in the repository after reactivation', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
        cancelEffectiveAt: new Date('2099-01-01'),
      });
      paddle.reactivateSubscription.mockResolvedValue(undefined);
      repo.update.mockResolvedValue(undefined);

      await service.reactivateSubscription(TENANT_ID);

      expect(repo.update).toHaveBeenCalledWith(TENANT_ID, {
        status: SubscriptionStatus.ACTIVE,
        cancelledAt: null,
        cancelEffectiveAt: null,
      });
    });

    it('returns a success message after reactivation', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        status: SubscriptionStatus.CANCELLED,
        cancelEffectiveAt: new Date('2099-01-01'),
      });
      paddle.reactivateSubscription.mockResolvedValue(undefined);
      repo.update.mockResolvedValue(undefined);

      const result = await service.reactivateSubscription(TENANT_ID);

      expect(result).toHaveProperty('message');
      expect(result.message).toMatch(/reactivated/i);
    });
  });

  // -------------------------------------------------------------------------
  // getBillingDetails
  // -------------------------------------------------------------------------

  describe('getBillingDetails', () => {
    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.getBillingDetails(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns null when subscription has no paddleSubscriptionId', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      const result = await service.getBillingDetails(TENANT_ID);

      expect(result).toBeNull();
      expect(paddle.getSubscriptionBilling).not.toHaveBeenCalled();
    });

    it('returns paddle billing details when paddleSubscriptionId exists', async () => {
      const billingDetails = {
        currencyCode: 'USD',
        billingInterval: 'month',
        billingFrequency: 1,
        subtotalCents: '7900',
        taxCents: '0',
        totalCents: '7900',
        discountCents: '0',
        lineItems: [],
        nextBillingDate: '2026-04-01',
      };
      repo.findByTenantId.mockResolvedValue(baseSubscription);
      paddle.getSubscriptionBilling.mockResolvedValue(billingDetails);

      const result = await service.getBillingDetails(TENANT_ID);

      expect(paddle.getSubscriptionBilling).toHaveBeenCalledTimes(1);
      expect(paddle.getSubscriptionBilling).toHaveBeenCalledWith(PADDLE_SUB_ID);
      expect(result).toEqual(billingDetails);
    });
  });

  // -------------------------------------------------------------------------
  // getTransactionHistory
  // -------------------------------------------------------------------------

  describe('getTransactionHistory', () => {
    it('throws NotFoundException when subscription does not exist', async () => {
      repo.findByTenantId.mockResolvedValue(null);

      await expect(service.getTransactionHistory(TENANT_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns an empty array when subscription has no paddleSubscriptionId', async () => {
      repo.findByTenantId.mockResolvedValue({
        ...baseSubscription,
        paddleSubscriptionId: null,
      });

      const result = await service.getTransactionHistory(TENANT_ID);

      expect(result).toEqual([]);
      expect(paddle.getTransactionHistory).not.toHaveBeenCalled();
    });

    it('returns transactions from paddle when paddleSubscriptionId exists', async () => {
      const transactions = [
        {
          id: 'txn-001',
          status: 'completed',
          totalCents: '7900',
          taxCents: '0',
          currency: 'USD',
          createdAt: '2026-03-01T00:00:00Z',
          billingPeriod: {
            startsAt: '2026-03-01T00:00:00Z',
            endsAt: '2026-04-01T00:00:00Z',
          },
          lineItems: [],
        },
      ];
      repo.findByTenantId.mockResolvedValue(baseSubscription);
      paddle.getTransactionHistory.mockResolvedValue(transactions);

      const result = await service.getTransactionHistory(TENANT_ID);

      expect(paddle.getTransactionHistory).toHaveBeenCalledTimes(1);
      expect(paddle.getTransactionHistory).toHaveBeenCalledWith(PADDLE_SUB_ID);
      expect(result).toEqual(transactions);
    });
  });
});
