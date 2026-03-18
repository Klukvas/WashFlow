import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionsRepository } from './subscriptions.repository';

describe('SubscriptionLimitsService', () => {
  let service: SubscriptionLimitsService;
  let repo: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';

  beforeEach(async () => {
    repo = {
      findByTenantId: jest.fn().mockResolvedValue(null),
      findByTenantIdWithAddons: jest.fn().mockResolvedValue(null),
      checkLimitAtomic: jest.fn(),
      countUsers: jest.fn(),
      countBranches: jest.fn(),
      countWorkPosts: jest.fn(),
      countServices: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionLimitsService,
        { provide: SubscriptionsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get<SubscriptionLimitsService>(SubscriptionLimitsService);
  });

  describe('checkLimit', () => {
    it('allows creation when no subscription exists (backward compat)', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: true,
        current: 0,
        max: null,
      });

      await expect(
        service.checkLimit(tenantId, 'users'),
      ).resolves.toBeUndefined();
      expect(repo.checkLimitAtomic).toHaveBeenCalledWith(tenantId, 'users');
    });

    it('allows creation when under the limit', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: true,
        current: 3,
        max: 5,
      });

      await expect(
        service.checkLimit(tenantId, 'users'),
      ).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when at the limit', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: false,
        current: 5,
        max: 5,
      });

      await expect(service.checkLimit(tenantId, 'users')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws ForbiddenException when over the limit', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: false,
        current: 6,
        max: 5,
      });

      await expect(service.checkLimit(tenantId, 'branches')).rejects.toThrow(
        /maximum 5 branches allowed/,
      );
    });

    it('includes resource name in the error message', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: false,
        current: 10,
        max: 5,
      });

      await expect(service.checkLimit(tenantId, 'workPosts')).rejects.toThrow(
        /work posts/,
      );
    });

    it('enforces services resource limit', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: false,
        current: 20,
        max: 20,
      });

      await expect(service.checkLimit(tenantId, 'services')).rejects.toThrow(
        /maximum 20 services allowed/,
      );
    });

    it('throws ForbiddenException when trial has expired', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: false,
        current: 0,
        max: null,
        trialExpired: true,
      });

      await expect(service.checkLimit(tenantId, 'users')).rejects.toThrow(
        'Trial has expired',
      );
    });

    it('allows creation when trial is still active', async () => {
      repo.checkLimitAtomic.mockResolvedValue({
        allowed: true,
        current: 3,
        max: 15,
      });

      await expect(
        service.checkLimit(tenantId, 'users'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getUsage', () => {
    it('returns usage with null limits when no subscription exists', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);
      repo.countUsers.mockResolvedValue(3);
      repo.countBranches.mockResolvedValue(1);
      repo.countWorkPosts.mockResolvedValue(2);
      repo.countServices.mockResolvedValue(4);

      const result = await service.getUsage(tenantId);

      expect(result.subscription).toBeNull();
      expect(result.usage.users).toEqual({ current: 3, max: null });
      expect(result.usage.branches).toEqual({ current: 1, max: null });
      expect(result.usage.workPosts).toEqual({ current: 2, max: null });
      expect(result.usage.services).toEqual({ current: 4, max: null });
    });

    it('returns usage with limits when subscription exists', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        id: 'sub-1',
        tenantId,
        planTier: 'BUSINESS',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        maxUsers: 10,
        maxBranches: 3,
        maxWorkPosts: 8,
        maxServices: 20,
        isTrial: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelEffectiveAt: null,
        addons: [],
      });
      repo.countUsers.mockResolvedValue(7);
      repo.countBranches.mockResolvedValue(2);
      repo.countWorkPosts.mockResolvedValue(5);
      repo.countServices.mockResolvedValue(10);

      const result = await service.getUsage(tenantId);

      expect(result.subscription?.planTier).toBe('BUSINESS');
      expect(result.subscription?.status).toBe('ACTIVE');
      expect(result.subscription?.maxUsers).toBe(10);
      expect(result.usage.users).toEqual({ current: 7, max: 10 });
      expect(result.usage.branches).toEqual({ current: 2, max: 3 });
      expect(result.usage.workPosts).toEqual({ current: 5, max: 8 });
      expect(result.usage.services).toEqual({ current: 10, max: 20 });
    });

    it('returns trial info when subscription is a trial', async () => {
      const trialEnd = new Date('2026-03-16T00:00:00.000Z');
      repo.findByTenantIdWithAddons.mockResolvedValue({
        id: 'sub-1',
        tenantId,
        planTier: 'TRIAL',
        status: 'TRIALING',
        billingInterval: null,
        maxUsers: 15,
        maxBranches: 3,
        maxWorkPosts: 10,
        maxServices: 20,
        isTrial: true,
        trialEndsAt: trialEnd,
        currentPeriodEnd: null,
        cancelEffectiveAt: null,
        addons: [],
      });
      repo.countUsers.mockResolvedValue(1);
      repo.countBranches.mockResolvedValue(1);
      repo.countWorkPosts.mockResolvedValue(0);
      repo.countServices.mockResolvedValue(0);

      const result = await service.getUsage(tenantId);

      expect(result.subscription?.isTrial).toBe(true);
      expect(result.subscription?.trialEndsAt).toBe(trialEnd.toISOString());
    });

    it('does not leak internal Paddle fields', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue({
        id: 'sub-1',
        tenantId,
        planTier: 'STARTER',
        status: 'ACTIVE',
        billingInterval: 'MONTHLY',
        maxUsers: 5,
        maxBranches: 2,
        maxWorkPosts: 5,
        maxServices: 20,
        isTrial: false,
        trialEndsAt: null,
        currentPeriodEnd: null,
        cancelEffectiveAt: null,
        paddleSubscriptionId: 'paddle-secret',
        paddleCustomerId: 'cus-secret',
        paddleStatus: 'active',
        addons: [],
      });
      repo.countUsers.mockResolvedValue(0);
      repo.countBranches.mockResolvedValue(0);
      repo.countWorkPosts.mockResolvedValue(0);
      repo.countServices.mockResolvedValue(0);

      const result = await service.getUsage(tenantId);

      expect(result.subscription).not.toHaveProperty('paddleSubscriptionId');
      expect(result.subscription).not.toHaveProperty('paddleCustomerId');
      expect(result.subscription).not.toHaveProperty('paddleStatus');
      expect(result.subscription).not.toHaveProperty('id');
      expect(result.subscription).not.toHaveProperty('tenantId');
    });

    it('calls all count queries exactly once', async () => {
      repo.findByTenantIdWithAddons.mockResolvedValue(null);
      repo.countUsers.mockResolvedValue(0);
      repo.countBranches.mockResolvedValue(0);
      repo.countWorkPosts.mockResolvedValue(0);
      repo.countServices.mockResolvedValue(0);

      await service.getUsage(tenantId);

      expect(repo.findByTenantIdWithAddons).toHaveBeenCalledTimes(1);
      expect(repo.countUsers).toHaveBeenCalledTimes(1);
      expect(repo.countBranches).toHaveBeenCalledTimes(1);
      expect(repo.countWorkPosts).toHaveBeenCalledTimes(1);
      expect(repo.countServices).toHaveBeenCalledTimes(1);
    });
  });
});
