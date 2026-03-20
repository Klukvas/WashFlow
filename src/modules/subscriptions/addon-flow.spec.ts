import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { PaddleService } from './paddle.service';
import { PaddlePriceCacheService } from './paddle-price-cache.service';
import {
  PlanTier,
  SubscriptionStatus,
  PLAN_LIMITS,
  ADDON_UNIT_SIZE,
  ResourceKey,
  calculateEffectiveLimit,
} from './plan.constants';

// ---------------------------------------------------------------------------
// Shared mutable state — bridges manageAddon() writes and checkLimit() reads
// ---------------------------------------------------------------------------

interface Addon {
  resource: string;
  quantity: number;
  paddlePriceId?: string;
}

interface SubscriptionState {
  id: string;
  tenantId: string;
  planTier: PlanTier;
  status: SubscriptionStatus;
  paddleSubscriptionId: string | null;
  paddleCustomerId: string | null;
  maxBranches: number | null;
  maxWorkPosts: number | null;
  maxUsers: number | null;
  maxServices: number | null;
  isTrial: boolean;
  trialEndsAt: Date | null;
  cancelEffectiveAt: Date | null;
  currentPeriodEnd: Date | null;
  addons: Addon[];
}

interface ResourceCounts {
  branches: number;
  workPosts: number;
  users: number;
  services: number;
}

const TENANT_ID = 'tenant-addon-flow';
const SUB_ID = 'sub-addon-flow';

function createStarterState(): SubscriptionState {
  return {
    id: SUB_ID,
    tenantId: TENANT_ID,
    planTier: PlanTier.STARTER,
    status: SubscriptionStatus.ACTIVE,
    paddleSubscriptionId: null,
    paddleCustomerId: null,
    maxBranches: PLAN_LIMITS[PlanTier.STARTER].branches,
    maxWorkPosts: PLAN_LIMITS[PlanTier.STARTER].workPosts,
    maxUsers: PLAN_LIMITS[PlanTier.STARTER].users,
    maxServices: PLAN_LIMITS[PlanTier.STARTER].services,
    isTrial: false,
    trialEndsAt: null,
    cancelEffectiveAt: null,
    currentPeriodEnd: null,
    addons: [],
  };
}

function recalcLimits(state: SubscriptionState): void {
  const addonQty: Record<ResourceKey, number> = {
    branches: 0,
    workPosts: 0,
    users: 0,
    services: 0,
  };
  for (const a of state.addons) {
    const r = a.resource as ResourceKey;
    if (r in addonQty) addonQty[r] = a.quantity;
  }
  state.maxBranches = calculateEffectiveLimit(
    state.planTier,
    'branches',
    addonQty.branches,
  );
  state.maxWorkPosts = calculateEffectiveLimit(
    state.planTier,
    'workPosts',
    addonQty.workPosts,
  );
  state.maxUsers = calculateEffectiveLimit(
    state.planTier,
    'users',
    addonQty.users,
  );
  state.maxServices = calculateEffectiveLimit(
    state.planTier,
    'services',
    addonQty.services,
  );
}

function getMax(
  state: SubscriptionState,
  resource: ResourceKey,
): number | null {
  switch (resource) {
    case 'branches':
      return state.maxBranches;
    case 'workPosts':
      return state.maxWorkPosts;
    case 'users':
      return state.maxUsers;
    case 'services':
      return state.maxServices;
  }
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Addon → Limit Increase Flow (integration)', () => {
  let service: SubscriptionsService;
  let limitsService: SubscriptionLimitsService;
  let stateRef: { current: SubscriptionState };
  let counts: ResourceCounts;

  beforeEach(async () => {
    stateRef = { current: createStarterState() };
    counts = { branches: 0, workPosts: 0, users: 0, services: 0 };

    const repo = {
      findByTenantId: jest
        .fn()
        .mockImplementation(async () => ({ ...stateRef.current })),

      findByTenantIdWithAddons: jest.fn().mockImplementation(async () => ({
        ...stateRef.current,
        addons: [...stateRef.current.addons],
      })),

      findByPaddleSubscriptionId: jest.fn().mockResolvedValue(null),

      upsert: jest.fn(),

      update: jest.fn(),

      upsertAddon: jest
        .fn()
        .mockImplementation(
          async (
            _id: string,
            resource: string,
            qty: number,
            priceId?: string,
          ) => {
            const existing = stateRef.current.addons.find(
              (a) => a.resource === resource,
            );
            if (existing) {
              // Immutable update: replace the addon
              stateRef.current = {
                ...stateRef.current,
                addons: stateRef.current.addons.map((a) =>
                  a.resource === resource
                    ? { resource, quantity: qty, paddlePriceId: priceId }
                    : a,
                ),
              };
            } else {
              stateRef.current = {
                ...stateRef.current,
                addons: [
                  ...stateRef.current.addons,
                  { resource, quantity: qty, paddlePriceId: priceId },
                ],
              };
            }
          },
        ),

      deleteAddon: jest
        .fn()
        .mockImplementation(async (_id: string, resource: string) => {
          stateRef.current = {
            ...stateRef.current,
            addons: stateRef.current.addons.filter(
              (a) => a.resource !== resource,
            ),
          };
        }),

      findAddons: jest
        .fn()
        .mockImplementation(async () => [...stateRef.current.addons]),

      updateLimits: jest.fn().mockImplementation(
        async (
          _tenantId: string,
          limits: {
            maxBranches: number | null;
            maxWorkPosts: number | null;
            maxUsers: number | null;
            maxServices: number | null;
          },
        ) => {
          stateRef.current = { ...stateRef.current, ...limits };
        },
      ),

      delete: jest.fn(),

      countUsers: jest.fn().mockImplementation(async () => counts.users),
      countBranches: jest.fn().mockImplementation(async () => counts.branches),
      countWorkPosts: jest
        .fn()
        .mockImplementation(async () => counts.workPosts),
      countServices: jest.fn().mockImplementation(async () => counts.services),

      checkLimitAtomic: jest
        .fn()
        .mockImplementation(
          async (_tenantId: string, resource: ResourceKey) => {
            const max = getMax(stateRef.current, resource);
            const current = counts[resource];
            if (max === null) return { allowed: true, current, max: null };
            return { allowed: current < max, current, max };
          },
        ),
    };

    const paddle = {
      createCheckoutTransaction: jest.fn(),
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn(),
      previewSubscriptionUpdate: jest.fn(),
    };

    const priceCache = {
      getCachedCatalog: jest.fn().mockResolvedValue({ plans: [], addons: [] }),
    };

    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'paddle.clientToken') return 'test-client-token';
        return fallback ?? null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        SubscriptionLimitsService,
        { provide: SubscriptionsRepository, useValue: repo },
        { provide: PaddleService, useValue: paddle },
        { provide: PaddlePriceCacheService, useValue: priceCache },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
    limitsService = module.get(SubscriptionLimitsService);
  });

  // -----------------------------------------------------------------------
  // 1. Add branch addon → limits increase → checkLimit allows/blocks
  // -----------------------------------------------------------------------
  describe('add branch addon → limits increase → checkLimit allows/blocks', () => {
    it('manageAddon(branches, qty=2) increases maxBranches from 1 to 3', async () => {
      expect(stateRef.current.maxBranches).toBe(1);

      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 2,
      });

      expect(stateRef.current.maxBranches).toBe(
        1 + 2 * ADDON_UNIT_SIZE.branches,
      ); // 3
    });

    it('checkLimit allows creation when count < new limit', async () => {
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 2,
      });
      counts.branches = 0;

      await expect(
        limitsService.checkLimit(TENANT_ID, 'branches'),
      ).resolves.toBeUndefined();
    });

    it('checkLimit blocks creation when count = new limit', async () => {
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 2,
      });
      counts.branches = 3;

      await expect(
        limitsService.checkLimit(TENANT_ID, 'branches'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('checkLimit blocks at base limit when no addon', async () => {
      counts.branches = 1; // STARTER base = 1

      await expect(
        limitsService.checkLimit(TENANT_ID, 'branches'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // 2. Remove addon → limits revert
  // -----------------------------------------------------------------------
  describe('remove addon → limits revert to base', () => {
    it('setting addon quantity to 0 reverts maxBranches to base', async () => {
      // Add addon first
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 2,
      });
      expect(stateRef.current.maxBranches).toBe(3);

      // Remove addon
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 0,
      });
      expect(stateRef.current.maxBranches).toBe(
        PLAN_LIMITS[PlanTier.STARTER].branches,
      ); // 1
    });

    it('checkLimit blocks at reverted base limit', async () => {
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 2,
      });
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 0,
      });
      counts.branches = 1;

      await expect(
        limitsService.checkLimit(TENANT_ID, 'branches'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // -----------------------------------------------------------------------
  // 3. All 4 resource types with addons simultaneously
  // -----------------------------------------------------------------------
  describe('all 4 resources with addons simultaneously', () => {
    beforeEach(async () => {
      await service.manageAddon(TENANT_ID, {
        resource: 'branches',
        quantity: 2,
      });
      await service.manageAddon(TENANT_ID, {
        resource: 'workPosts',
        quantity: 3,
      });
      await service.manageAddon(TENANT_ID, { resource: 'users', quantity: 2 });
      await service.manageAddon(TENANT_ID, {
        resource: 'services',
        quantity: 4,
      });
    });

    it('limits are correctly calculated for all resources', () => {
      // STARTER base + addon * unitSize
      expect(stateRef.current.maxBranches).toBe(1 + 2 * 1); // 3
      expect(stateRef.current.maxWorkPosts).toBe(5 + 3 * 5); // 20
      expect(stateRef.current.maxUsers).toBe(5 + 2 * 5); // 15
      expect(stateRef.current.maxServices).toBe(15 + 4 * 10); // 55
    });

    it.each<[ResourceKey, number]>([
      ['branches', 2],
      ['workPosts', 19],
      ['users', 14],
      ['services', 54],
    ])(
      'checkLimit allows %s when count (%d) is under limit',
      async (resource, count) => {
        counts[resource] = count;
        await expect(
          limitsService.checkLimit(TENANT_ID, resource),
        ).resolves.toBeUndefined();
      },
    );

    it.each<[ResourceKey, number]>([
      ['branches', 3],
      ['workPosts', 20],
      ['users', 15],
      ['services', 55],
    ])(
      'checkLimit blocks %s when count (%d) equals limit',
      async (resource, count) => {
        counts[resource] = count;
        await expect(
          limitsService.checkLimit(TENANT_ID, resource),
        ).rejects.toThrow(ForbiddenException);
      },
    );
  });

  // -----------------------------------------------------------------------
  // 4. TRIAL tier rejects addon
  // -----------------------------------------------------------------------
  describe('TRIAL tier rejects addon', () => {
    it('throws BadRequestException', async () => {
      stateRef.current = {
        ...stateRef.current,
        planTier: PlanTier.TRIAL,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      await expect(
        service.manageAddon(TENANT_ID, { resource: 'branches', quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('error message mentions trial', async () => {
      stateRef.current = {
        ...stateRef.current,
        planTier: PlanTier.TRIAL,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      };

      await expect(
        service.manageAddon(TENANT_ID, { resource: 'branches', quantity: 1 }),
      ).rejects.toThrow(/trial/i);
    });
  });

  // -----------------------------------------------------------------------
  // 5. ENTERPRISE tier allows addons (same as other paid tiers)
  // -----------------------------------------------------------------------
  describe('ENTERPRISE tier allows addon', () => {
    it('does not throw for ENTERPRISE tier', async () => {
      stateRef.current = {
        ...stateRef.current,
        planTier: PlanTier.ENTERPRISE,
        maxBranches: 25,
        maxWorkPosts: 100,
        maxUsers: null,
        maxServices: null,
      };

      await expect(
        service.manageAddon(TENANT_ID, { resource: 'branches', quantity: 1 }),
      ).resolves.not.toThrow();
    });
  });
});
