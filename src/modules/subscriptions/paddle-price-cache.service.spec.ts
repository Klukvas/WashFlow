import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  PaddlePriceCacheService,
  CachedPlanCatalog,
} from './paddle-price-cache.service';
import { PaddleService, PaddlePriceInfo } from './paddle.service';
import { PRICE_CACHE_REDIS } from './subscriptions.constants';
import { PLAN_CATALOG, ADDON_DEFINITIONS } from './plan.constants';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function buildRedisMock() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
  };
}

function buildPaddleMock() {
  return {
    fetchAllPrices: jest.fn().mockResolvedValue(new Map()),
  };
}

function buildConfigMock() {
  return {
    get: jest.fn((_key: string) => ({})),
  };
}

function buildPaddlePricesMap(): Map<string, PaddlePriceInfo> {
  const map = new Map<string, PaddlePriceInfo>();
  map.set('pri_starter_monthly', {
    amountCents: '3500',
    currency: 'USD',
    name: 'Starter Monthly',
  });
  map.set('pri_starter_yearly', {
    amountCents: '35000',
    currency: 'USD',
    name: 'Starter Yearly',
  });
  map.set('pri_business_monthly', {
    amountCents: '8500',
    currency: 'USD',
    name: 'Business Monthly',
  });
  map.set('pri_business_yearly', {
    amountCents: '85000',
    currency: 'USD',
    name: 'Business Yearly',
  });
  map.set('pri_enterprise_monthly', {
    amountCents: '22000',
    currency: 'USD',
    name: 'Enterprise Monthly',
  });
  map.set('pri_enterprise_yearly', {
    amountCents: '220000',
    currency: 'USD',
    name: 'Enterprise Yearly',
  });
  map.set('pri_addon_branches', {
    amountCents: '1800',
    currency: 'USD',
    name: 'Extra Branch',
  });
  map.set('pri_addon_work_posts', {
    amountCents: '1200',
    currency: 'USD',
    name: 'Extra Work Posts',
  });
  map.set('pri_addon_users', {
    amountCents: '700',
    currency: 'USD',
    name: 'Extra Users',
  });
  map.set('pri_addon_services', {
    amountCents: '600',
    currency: 'USD',
    name: 'Extra Services',
  });
  return map;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PaddlePriceCacheService', () => {
  let service: PaddlePriceCacheService;
  let redis: ReturnType<typeof buildRedisMock>;
  let paddle: ReturnType<typeof buildPaddleMock>;

  beforeEach(async () => {
    redis = buildRedisMock();
    paddle = buildPaddleMock();
    const config = buildConfigMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaddlePriceCacheService,
        { provide: PRICE_CACHE_REDIS, useValue: redis },
        { provide: PaddleService, useValue: paddle },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<PaddlePriceCacheService>(PaddlePriceCacheService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // onModuleInit
  // -------------------------------------------------------------------------

  describe('onModuleInit', () => {
    it('calls refreshCache on startup', async () => {
      paddle.fetchAllPrices.mockResolvedValue(buildPaddlePricesMap());

      await service.onModuleInit();

      expect(paddle.fetchAllPrices).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledTimes(1);
    });

    it('does not throw when Paddle API fails on startup', async () => {
      paddle.fetchAllPrices.mockRejectedValue(new Error('Paddle down'));

      await expect(service.onModuleInit()).resolves.toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // refreshCache
  // -------------------------------------------------------------------------

  describe('refreshCache', () => {
    it('fetches prices from Paddle and stores in Redis', async () => {
      const pricesMap = buildPaddlePricesMap();
      paddle.fetchAllPrices.mockResolvedValue(pricesMap);

      await service.refreshCache();

      expect(paddle.fetchAllPrices).toHaveBeenCalledTimes(1);
      expect(redis.set).toHaveBeenCalledWith(
        'catalog',
        expect.any(String),
        'EX',
        3600,
      );
    });

    it('stores catalog with Paddle prices instead of hardcoded', async () => {
      const pricesMap = buildPaddlePricesMap();
      paddle.fetchAllPrices.mockResolvedValue(pricesMap);

      await service.refreshCache();

      const storedJson = redis.set.mock.calls[0][1] as string;
      const catalog = JSON.parse(storedJson) as CachedPlanCatalog;

      const starter = catalog.plans.find((p) => p.tier === 'STARTER');
      expect(starter?.monthlyPrice).toBe(35); // 3500 cents → $35
      expect(starter?.yearlyPrice).toBe(350); // 35000 cents → $350

      const business = catalog.plans.find((p) => p.tier === 'BUSINESS');
      expect(business?.monthlyPrice).toBe(85); // 8500 cents → $85

      const branchAddon = catalog.addons.find((a) => a.resource === 'branches');
      expect(branchAddon?.monthlyPrice).toBe(18); // 1800 cents → $18
    });

    it('preserves limits and addonsAvailable from constants', async () => {
      paddle.fetchAllPrices.mockResolvedValue(buildPaddlePricesMap());

      await service.refreshCache();

      const storedJson = redis.set.mock.calls[0][1] as string;
      const catalog = JSON.parse(storedJson) as CachedPlanCatalog;

      const enterprise = catalog.plans.find((p) => p.tier === 'ENTERPRISE');
      expect(enterprise?.addonsAvailable).toBe(true);
      expect(enterprise?.limits.users).toBeNull(); // unlimited

      const starter = catalog.plans.find((p) => p.tier === 'STARTER');
      expect(starter?.limits.branches).toBe(1);
      expect(starter?.addonsAvailable).toBe(true);
    });

    it('preserves unitSize from addon constants', async () => {
      paddle.fetchAllPrices.mockResolvedValue(buildPaddlePricesMap());

      await service.refreshCache();

      const storedJson = redis.set.mock.calls[0][1] as string;
      const catalog = JSON.parse(storedJson) as CachedPlanCatalog;

      const workPosts = catalog.addons.find((a) => a.resource === 'workPosts');
      expect(workPosts?.unitSize).toBe(5);
    });

    it('falls back to hardcoded price when a specific price ID is missing from Paddle', async () => {
      const partialMap = new Map<string, PaddlePriceInfo>();
      partialMap.set('pri_starter_monthly', {
        amountCents: '3500',
        currency: 'USD',
        name: 'Starter Monthly',
      });
      paddle.fetchAllPrices.mockResolvedValue(partialMap);

      await service.refreshCache();

      const storedJson = redis.set.mock.calls[0][1] as string;
      const catalog = JSON.parse(storedJson) as CachedPlanCatalog;

      const starter = catalog.plans.find((p) => p.tier === 'STARTER');
      expect(starter?.monthlyPrice).toBe(35); // from Paddle
      expect(starter?.yearlyPrice).toBe(290); // fallback to hardcoded

      const business = catalog.plans.find((p) => p.tier === 'BUSINESS');
      expect(business?.monthlyPrice).toBe(79); // fallback to hardcoded
    });
  });

  // -------------------------------------------------------------------------
  // getCachedCatalog
  // -------------------------------------------------------------------------

  describe('getCachedCatalog', () => {
    it('returns cached data from Redis when available', async () => {
      const cached: CachedPlanCatalog = {
        plans: [
          {
            tier: 'STARTER',
            name: 'Starter',
            monthlyPrice: 35,
            yearlyPrice: 350,
            limits: { branches: 1, workPosts: 5, users: 5, services: 15 },
            addonsAvailable: true,
          },
        ],
        addons: [],
      };
      redis.get.mockResolvedValue(JSON.stringify(cached));

      const result = await service.getCachedCatalog();

      expect(result).toEqual(cached);
      expect(paddle.fetchAllPrices).not.toHaveBeenCalled();
    });

    it('refreshes on demand when cache is empty', async () => {
      redis.get
        .mockResolvedValueOnce(null) // first read — miss
        .mockResolvedValueOnce(JSON.stringify({ plans: [], addons: [] })); // after refresh
      paddle.fetchAllPrices.mockResolvedValue(new Map());

      const result = await service.getCachedCatalog();

      expect(paddle.fetchAllPrices).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ plans: [], addons: [] });
    });

    it('returns hardcoded fallback when Redis and Paddle both fail', async () => {
      redis.get.mockRejectedValue(new Error('Redis down'));

      const result = await service.getCachedCatalog();

      // Should match PLAN_CATALOG structure with hardcoded prices
      expect(result.plans).toHaveLength(PLAN_CATALOG.length);
      expect(result.addons).toHaveLength(ADDON_DEFINITIONS.length);

      const starter = result.plans.find((p) => p.tier === 'STARTER');
      expect(starter?.monthlyPrice).toBe(29); // hardcoded fallback
      expect(starter?.yearlyPrice).toBe(290);
    });

    it('returns fallback when Redis is up but refresh fails and no cache', async () => {
      redis.get.mockResolvedValue(null);
      paddle.fetchAllPrices.mockRejectedValue(new Error('Paddle API error'));

      const result = await service.getCachedCatalog();

      expect(result.plans).toHaveLength(PLAN_CATALOG.length);
      const business = result.plans.find((p) => p.tier === 'BUSINESS');
      expect(business?.monthlyPrice).toBe(79); // hardcoded
    });

    it('deduplicates concurrent refreshes (single Paddle call for parallel requests)', async () => {
      redis.get.mockResolvedValue(null);
      paddle.fetchAllPrices.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(buildPaddlePricesMap()), 50);
          }),
      );

      // Fire 3 concurrent requests
      const results = await Promise.all([
        service.getCachedCatalog(),
        service.getCachedCatalog(),
        service.getCachedCatalog(),
      ]);

      // Should only call Paddle once (dedup)
      expect(paddle.fetchAllPrices).toHaveBeenCalledTimes(1);
      // All results should be valid
      for (const r of results) {
        expect(r.plans.length).toBeGreaterThan(0);
      }
    });
  });
});
