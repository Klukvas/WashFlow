import { SubscriptionsRepository } from './subscriptions.repository';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-001';

const mockSubscription = {
  id: 'sub-1',
  tenantId: TENANT_ID,
  maxUsers: 15,
  maxBranches: 3,
  maxWorkPosts: 10,
  maxServices: 20,
  isTrial: false,
  trialEndsAt: null,
};

const mockTrialSubscription = {
  ...mockSubscription,
  isTrial: true,
  trialEndsAt: new Date('2026-04-01'),
};

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

function buildPrismaMock() {
  const txClient = {
    subscription: { findUnique: jest.fn() },
    user: { count: jest.fn() },
    branch: { count: jest.fn() },
    workPost: { count: jest.fn() },
    service: { count: jest.fn() },
  };

  return {
    subscription: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subscriptionAddon: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findMany: jest.fn(),
    },
    user: { count: jest.fn() },
    branch: { count: jest.fn() },
    workPost: { count: jest.fn() },
    service: { count: jest.fn() },
    $transaction: jest.fn(async (fn: any) => fn(txClient)),
    _txClient: txClient,
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('SubscriptionsRepository', () => {
  let repo: SubscriptionsRepository;
  let prisma: ReturnType<typeof buildPrismaMock>;

  beforeEach(() => {
    prisma = buildPrismaMock();
    repo = new SubscriptionsRepository(prisma as any);
  });

  // =========================================================================
  // findByTenantId
  // =========================================================================

  describe('findByTenantId', () => {
    it('returns subscription when found', async () => {
      prisma.subscription.findUnique.mockResolvedValue(mockSubscription);

      const result = await repo.findByTenantId(TENANT_ID);

      expect(result).toEqual(mockSubscription);
      expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
    });

    it('returns null when no subscription exists', async () => {
      prisma.subscription.findUnique.mockResolvedValue(null);

      const result = await repo.findByTenantId(TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // upsert
  // =========================================================================

  describe('upsert', () => {
    it('creates or updates subscription with data', async () => {
      const data = {
        maxUsers: 20,
        maxBranches: 5,
        maxWorkPosts: 15,
        maxServices: 30,
      };
      prisma.subscription.upsert.mockResolvedValue({
        ...mockSubscription,
        ...data,
      });

      const result = await repo.upsert(TENANT_ID, data);

      expect(prisma.subscription.upsert).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        create: { tenantId: TENANT_ID, ...data },
        update: data,
      });
      expect(result.maxUsers).toBe(20);
    });

    it('includes trial fields when provided', async () => {
      const data = {
        maxUsers: 10,
        maxBranches: 2,
        maxWorkPosts: 5,
        maxServices: 10,
        isTrial: true,
        trialEndsAt: new Date('2026-05-01'),
      };
      prisma.subscription.upsert.mockResolvedValue({
        ...mockSubscription,
        ...data,
      });

      await repo.upsert(TENANT_ID, data);

      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ isTrial: true }),
          update: expect.objectContaining({ isTrial: true }),
        }),
      );
    });
  });

  // =========================================================================
  // delete
  // =========================================================================

  describe('delete', () => {
    it('deletes subscription by tenantId', async () => {
      prisma.subscription.delete.mockResolvedValue(mockSubscription);

      await repo.delete(TENANT_ID);

      expect(prisma.subscription.delete).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
    });
  });

  // =========================================================================
  // findByTenantIdWithAddons
  // =========================================================================

  describe('findByTenantIdWithAddons', () => {
    it('calls findUnique with include addons', async () => {
      const subWithAddons = { ...mockSubscription, addons: [] };
      prisma.subscription.findUnique.mockResolvedValue(subWithAddons);

      const result = await repo.findByTenantIdWithAddons(TENANT_ID);

      expect(prisma.subscription.findUnique).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        include: { addons: true },
      });
      expect(result).toEqual(subWithAddons);
    });
  });

  // =========================================================================
  // findByPaddleSubscriptionId
  // =========================================================================

  describe('findByPaddleSubscriptionId', () => {
    it('calls findFirst with paddleSubscriptionId', async () => {
      prisma.subscription.findFirst.mockResolvedValue(mockSubscription);

      const result = await repo.findByPaddleSubscriptionId('paddle-sub-1');

      expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
        where: { paddleSubscriptionId: 'paddle-sub-1' },
        include: { addons: true },
      });
      expect(result).toEqual(mockSubscription);
    });
  });

  // =========================================================================
  // update
  // =========================================================================

  describe('update', () => {
    it('calls prisma.subscription.update with tenantId and data', async () => {
      const data = { status: 'ACTIVE' as const };
      prisma.subscription.update.mockResolvedValue({
        ...mockSubscription,
        ...data,
      });

      await repo.update(TENANT_ID, data);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        data,
      });
    });
  });

  // =========================================================================
  // updateLimits
  // =========================================================================

  describe('updateLimits', () => {
    it('calls update with all 4 limit fields', async () => {
      const limits = {
        maxUsers: 50,
        maxBranches: 10,
        maxWorkPosts: 30,
        maxServices: 100,
      };
      prisma.subscription.update.mockResolvedValue({
        ...mockSubscription,
        ...limits,
      });

      await repo.updateLimits(TENANT_ID, limits);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        data: limits,
      });
    });
  });

  // =========================================================================
  // upsertAddon
  // =========================================================================

  describe('upsertAddon', () => {
    it('calls upsert with composite key', async () => {
      prisma.subscriptionAddon.upsert.mockResolvedValue({});

      await repo.upsertAddon('sub-1', 'branches', 3, 'pri_addon');

      expect(prisma.subscriptionAddon.upsert).toHaveBeenCalledWith({
        where: {
          subscriptionId_resource: {
            subscriptionId: 'sub-1',
            resource: 'branches',
          },
        },
        create: {
          subscriptionId: 'sub-1',
          resource: 'branches',
          quantity: 3,
          paddlePriceId: 'pri_addon',
        },
        update: { quantity: 3, paddlePriceId: 'pri_addon' },
      });
    });
  });

  // =========================================================================
  // deleteAddon
  // =========================================================================

  describe('deleteAddon', () => {
    it('calls deleteMany with subscriptionId and resource', async () => {
      prisma.subscriptionAddon.deleteMany.mockResolvedValue({ count: 1 });

      await repo.deleteAddon('sub-1', 'users');

      expect(prisma.subscriptionAddon.deleteMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1', resource: 'users' },
      });
    });
  });

  // =========================================================================
  // findAddons
  // =========================================================================

  describe('findAddons', () => {
    it('calls findMany with subscriptionId', async () => {
      prisma.subscriptionAddon.findMany.mockResolvedValue([]);

      await repo.findAddons('sub-1');

      expect(prisma.subscriptionAddon.findMany).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1' },
      });
    });
  });

  // =========================================================================
  // checkLimitAtomic
  // =========================================================================

  describe('checkLimitAtomic', () => {
    it('returns allowed: true when no subscription exists', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(null);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({
        allowed: true,
        current: 0,
        max: null,
      });
    });

    it('returns allowed: false with trialExpired when trial has expired', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockTrialSubscription,
        trialEndsAt: new Date('2020-01-01'), // past date
      });

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({
        allowed: false,
        current: 0,
        max: null,
        trialExpired: true,
      });
    });

    it('returns allowed: true when under users limit', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription,
      );
      prisma._txClient.user.count.mockResolvedValue(10);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({ allowed: true, current: 10, max: 15 });
    });

    it('returns allowed: false when at users limit', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription,
      );
      prisma._txClient.user.count.mockResolvedValue(15);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({ allowed: false, current: 15, max: 15 });
    });

    it('returns allowed: false when over users limit', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription,
      );
      prisma._txClient.user.count.mockResolvedValue(16);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({ allowed: false, current: 16, max: 15 });
    });

    it('checks branches limit correctly', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription,
      );
      prisma._txClient.branch.count.mockResolvedValue(2);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'branches');

      expect(result).toEqual({ allowed: true, current: 2, max: 3 });
    });

    it('checks workPosts limit correctly', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription,
      );
      prisma._txClient.workPost.count.mockResolvedValue(10);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'workPosts');

      expect(result).toEqual({ allowed: false, current: 10, max: 10 });
    });

    it('checks services limit correctly', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription,
      );
      prisma._txClient.service.count.mockResolvedValue(19);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'services');

      expect(result).toEqual({ allowed: true, current: 19, max: 20 });
    });

    it('uses Serializable isolation level', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(null);

      await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          isolationLevel: 'Serializable',
        }),
      );
    });

    it('does not mark trialExpired for non-trial subscriptions', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue(
        mockSubscription, // isTrial: false
      );
      prisma._txClient.user.count.mockResolvedValue(5);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).not.toHaveProperty('trialExpired');
    });

    it('returns subscriptionInactive when cancelled with future cancelEffectiveAt past now', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: 'CANCELLED',
        cancelEffectiveAt: new Date('2020-01-01'), // past
      });

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({
        allowed: false,
        current: 0,
        max: null,
        subscriptionInactive: true,
      });
    });

    it('allows creation when cancelled but cancelEffectiveAt is in the future', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: 'CANCELLED',
        cancelEffectiveAt: new Date('2099-01-01'), // future
      });
      prisma._txClient.user.count.mockResolvedValue(5);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result.allowed).toBe(true);
      expect(result).not.toHaveProperty('subscriptionInactive');
    });

    it('returns subscriptionInactive when status is PAUSED', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: 'PAUSED',
      });

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({
        allowed: false,
        current: 0,
        max: null,
        subscriptionInactive: true,
      });
    });

    it('returns subscriptionInactive when status is PAST_DUE', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: 'PAST_DUE',
      });

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({
        allowed: false,
        current: 0,
        max: null,
        subscriptionInactive: true,
      });
    });

    it('returns allowed when max is null (unlimited)', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        maxUsers: null,
        status: 'ACTIVE',
      });
      prisma._txClient.user.count.mockResolvedValue(999);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({ allowed: true, current: 999, max: null });
    });

    it('returns subscriptionInactive when cancelled with null cancelEffectiveAt', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockSubscription,
        status: 'CANCELLED',
        cancelEffectiveAt: null,
      });

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result).toEqual({
        allowed: false,
        current: 0,
        max: null,
        subscriptionInactive: true,
      });
    });

    it('does not mark trialExpired when trial has not ended yet', async () => {
      prisma._txClient.subscription.findUnique.mockResolvedValue({
        ...mockTrialSubscription,
        trialEndsAt: new Date('2099-01-01'), // far future
      });
      prisma._txClient.user.count.mockResolvedValue(5);

      const result = await repo.checkLimitAtomic(TENANT_ID, 'users');

      expect(result.allowed).toBe(true);
      expect(result).not.toHaveProperty('trialExpired');
    });
  });

  // =========================================================================
  // Count methods
  // =========================================================================

  describe('count methods', () => {
    it('countUsers queries with tenantId and deletedAt: null', async () => {
      prisma.user.count.mockResolvedValue(5);

      const result = await repo.countUsers(TENANT_ID);

      expect(result).toBe(5);
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, deletedAt: null },
      });
    });

    it('countBranches queries with tenantId and deletedAt: null', async () => {
      prisma.branch.count.mockResolvedValue(3);

      const result = await repo.countBranches(TENANT_ID);

      expect(result).toBe(3);
      expect(prisma.branch.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, deletedAt: null },
      });
    });

    it('countWorkPosts queries with tenantId and deletedAt: null', async () => {
      prisma.workPost.count.mockResolvedValue(7);

      const result = await repo.countWorkPosts(TENANT_ID);

      expect(result).toBe(7);
      expect(prisma.workPost.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, deletedAt: null },
      });
    });

    it('countServices queries with tenantId and deletedAt: null', async () => {
      prisma.service.count.mockResolvedValue(12);

      const result = await repo.countServices(TENANT_ID);

      expect(result).toBe(12);
      expect(prisma.service.count).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, deletedAt: null },
      });
    });
  });
});
