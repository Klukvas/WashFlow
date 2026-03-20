import {
  ADDON_UNIT_SIZE,
  ADDON_PRICE_ID_TO_RESOURCE,
  DEFAULT_ADDON_PADDLE_PRICE_IDS,
  DEFAULT_PADDLE_PRICE_IDS,
  calculateEffectiveLimit,
  isDowngrade,
  isUpgrade,
  PLAN_CATALOG,
  PLAN_LIMITS,
  PLAN_ORDER,
  PlanTier,
  TRIAL_DURATION_DAYS,
} from './plan.constants';

describe('plan.constants', () => {
  // ---------------------------------------------------------------------------
  // PLAN_LIMITS
  // ---------------------------------------------------------------------------
  describe('PLAN_LIMITS', () => {
    describe('TRIAL tier', () => {
      it('has 3 branches', () => {
        expect(PLAN_LIMITS[PlanTier.TRIAL].branches).toBe(3);
      });

      it('has 10 workPosts', () => {
        expect(PLAN_LIMITS[PlanTier.TRIAL].workPosts).toBe(10);
      });

      it('has 15 users', () => {
        expect(PLAN_LIMITS[PlanTier.TRIAL].users).toBe(15);
      });

      it('has 20 services', () => {
        expect(PLAN_LIMITS[PlanTier.TRIAL].services).toBe(20);
      });
    });

    describe('STARTER tier', () => {
      it('has 1 branch', () => {
        expect(PLAN_LIMITS[PlanTier.STARTER].branches).toBe(1);
      });

      it('has 5 workPosts', () => {
        expect(PLAN_LIMITS[PlanTier.STARTER].workPosts).toBe(5);
      });

      it('has 5 users', () => {
        expect(PLAN_LIMITS[PlanTier.STARTER].users).toBe(5);
      });

      it('has 15 services', () => {
        expect(PLAN_LIMITS[PlanTier.STARTER].services).toBe(15);
      });
    });

    describe('BUSINESS tier', () => {
      it('has 5 branches', () => {
        expect(PLAN_LIMITS[PlanTier.BUSINESS].branches).toBe(5);
      });

      it('has 25 workPosts', () => {
        expect(PLAN_LIMITS[PlanTier.BUSINESS].workPosts).toBe(25);
      });

      it('has 25 users', () => {
        expect(PLAN_LIMITS[PlanTier.BUSINESS].users).toBe(25);
      });

      it('has 50 services', () => {
        expect(PLAN_LIMITS[PlanTier.BUSINESS].services).toBe(50);
      });
    });

    describe('ENTERPRISE tier', () => {
      it('has 25 branches', () => {
        expect(PLAN_LIMITS[PlanTier.ENTERPRISE].branches).toBe(25);
      });

      it('has 100 workPosts', () => {
        expect(PLAN_LIMITS[PlanTier.ENTERPRISE].workPosts).toBe(100);
      });

      it('has null (unlimited) users', () => {
        expect(PLAN_LIMITS[PlanTier.ENTERPRISE].users).toBeNull();
      });

      it('has null (unlimited) services', () => {
        expect(PLAN_LIMITS[PlanTier.ENTERPRISE].services).toBeNull();
      });
    });

    it('covers all four plan tiers', () => {
      const definedTiers = Object.keys(PLAN_LIMITS) as PlanTier[];
      expect(definedTiers).toEqual(
        expect.arrayContaining([
          PlanTier.TRIAL,
          PlanTier.STARTER,
          PlanTier.BUSINESS,
          PlanTier.ENTERPRISE,
        ]),
      );
      expect(definedTiers).toHaveLength(4);
    });

    it('only ENTERPRISE has null resource limits', () => {
      const tiersWithNullUsers = Object.entries(PLAN_LIMITS)
        .filter(([, limits]) => limits.users === null)
        .map(([tier]) => tier);

      expect(tiersWithNullUsers).toEqual([PlanTier.ENTERPRISE]);
    });
  });

  // ---------------------------------------------------------------------------
  // ADDON_UNIT_SIZE
  // ---------------------------------------------------------------------------
  describe('ADDON_UNIT_SIZE', () => {
    it('branches unit size is 1', () => {
      expect(ADDON_UNIT_SIZE.branches).toBe(1);
    });

    it('workPosts unit size is 5', () => {
      expect(ADDON_UNIT_SIZE.workPosts).toBe(5);
    });

    it('users unit size is 5', () => {
      expect(ADDON_UNIT_SIZE.users).toBe(5);
    });

    it('services unit size is 10', () => {
      expect(ADDON_UNIT_SIZE.services).toBe(10);
    });

    it('contains entries for all four resource keys', () => {
      expect(Object.keys(ADDON_UNIT_SIZE)).toEqual(
        expect.arrayContaining(['branches', 'workPosts', 'users', 'services']),
      );
      expect(Object.keys(ADDON_UNIT_SIZE)).toHaveLength(4);
    });

    it('all unit sizes are positive integers', () => {
      for (const size of Object.values(ADDON_UNIT_SIZE)) {
        expect(size).toBeGreaterThan(0);
        expect(Number.isInteger(size)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // calculateEffectiveLimit
  // ---------------------------------------------------------------------------
  describe('calculateEffectiveLimit', () => {
    describe('with 0 addons (base limit only)', () => {
      it('returns base branches limit for STARTER', () => {
        expect(calculateEffectiveLimit(PlanTier.STARTER, 'branches', 0)).toBe(
          1,
        );
      });

      it('returns base workPosts limit for BUSINESS', () => {
        expect(calculateEffectiveLimit(PlanTier.BUSINESS, 'workPosts', 0)).toBe(
          25,
        );
      });

      it('returns base users limit for TRIAL', () => {
        expect(calculateEffectiveLimit(PlanTier.TRIAL, 'users', 0)).toBe(15);
      });

      it('returns base services limit for STARTER', () => {
        expect(calculateEffectiveLimit(PlanTier.STARTER, 'services', 0)).toBe(
          15,
        );
      });
    });

    describe('with addons applied', () => {
      it('adds 1 extra branch per addon unit for STARTER', () => {
        // base 1 + 3 addons * unit 1 = 4
        expect(calculateEffectiveLimit(PlanTier.STARTER, 'branches', 3)).toBe(
          4,
        );
      });

      it('adds 5 extra workPosts per addon unit for BUSINESS', () => {
        // base 25 + 2 addons * unit 5 = 35
        expect(calculateEffectiveLimit(PlanTier.BUSINESS, 'workPosts', 2)).toBe(
          35,
        );
      });

      it('adds 5 extra users per addon unit for STARTER', () => {
        // base 5 + 4 addons * unit 5 = 25
        expect(calculateEffectiveLimit(PlanTier.STARTER, 'users', 4)).toBe(25);
      });

      it('adds 10 extra services per addon unit for BUSINESS', () => {
        // base 50 + 3 addons * unit 10 = 80
        expect(calculateEffectiveLimit(PlanTier.BUSINESS, 'services', 3)).toBe(
          80,
        );
      });

      it('handles a single addon correctly', () => {
        // STARTER branches: base 1 + 1 addon * unit 1 = 2
        expect(calculateEffectiveLimit(PlanTier.STARTER, 'branches', 1)).toBe(
          2,
        );
      });

      it('handles a large addon quantity correctly', () => {
        // STARTER users: base 5 + 100 addons * unit 5 = 505
        expect(calculateEffectiveLimit(PlanTier.STARTER, 'users', 100)).toBe(
          505,
        );
      });
    });

    describe('unlimited (null) resources', () => {
      it('returns null for ENTERPRISE users regardless of addon quantity 0', () => {
        expect(
          calculateEffectiveLimit(PlanTier.ENTERPRISE, 'users', 0),
        ).toBeNull();
      });

      it('returns null for ENTERPRISE users regardless of addon quantity 5', () => {
        expect(
          calculateEffectiveLimit(PlanTier.ENTERPRISE, 'users', 5),
        ).toBeNull();
      });

      it('returns null for ENTERPRISE services regardless of addon quantity 0', () => {
        expect(
          calculateEffectiveLimit(PlanTier.ENTERPRISE, 'services', 0),
        ).toBeNull();
      });

      it('returns null for ENTERPRISE services regardless of large addon quantity', () => {
        expect(
          calculateEffectiveLimit(PlanTier.ENTERPRISE, 'services', 999),
        ).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('returns exact base limit when addonQuantity is 0 (no mutation)', () => {
        const result = calculateEffectiveLimit(
          PlanTier.BUSINESS,
          'branches',
          0,
        );
        expect(result).toBe(PLAN_LIMITS[PlanTier.BUSINESS].branches);
      });

      it('is a pure function — repeated calls with same args return same result', () => {
        const first = calculateEffectiveLimit(PlanTier.STARTER, 'users', 2);
        const second = calculateEffectiveLimit(PlanTier.STARTER, 'users', 2);
        expect(first).toBe(second);
      });

      it('throws when addonQuantity is negative', () => {
        expect(() =>
          calculateEffectiveLimit(PlanTier.STARTER, 'branches', -1),
        ).toThrow('addonQuantity must be non-negative');
      });

      it('throws with resource name in error for negative quantity', () => {
        expect(() =>
          calculateEffectiveLimit(PlanTier.BUSINESS, 'users', -5),
        ).toThrow('users');
      });
    });
  });

  // ---------------------------------------------------------------------------
  // isUpgrade / isDowngrade
  // ---------------------------------------------------------------------------
  describe('isUpgrade', () => {
    it('TRIAL -> STARTER is an upgrade', () => {
      expect(isUpgrade(PlanTier.TRIAL, PlanTier.STARTER)).toBe(true);
    });

    it('TRIAL -> BUSINESS is an upgrade', () => {
      expect(isUpgrade(PlanTier.TRIAL, PlanTier.BUSINESS)).toBe(true);
    });

    it('TRIAL -> ENTERPRISE is an upgrade', () => {
      expect(isUpgrade(PlanTier.TRIAL, PlanTier.ENTERPRISE)).toBe(true);
    });

    it('STARTER -> BUSINESS is an upgrade', () => {
      expect(isUpgrade(PlanTier.STARTER, PlanTier.BUSINESS)).toBe(true);
    });

    it('STARTER -> ENTERPRISE is an upgrade', () => {
      expect(isUpgrade(PlanTier.STARTER, PlanTier.ENTERPRISE)).toBe(true);
    });

    it('BUSINESS -> ENTERPRISE is an upgrade', () => {
      expect(isUpgrade(PlanTier.BUSINESS, PlanTier.ENTERPRISE)).toBe(true);
    });

    it('same tier is NOT an upgrade', () => {
      expect(isUpgrade(PlanTier.STARTER, PlanTier.STARTER)).toBe(false);
      expect(isUpgrade(PlanTier.BUSINESS, PlanTier.BUSINESS)).toBe(false);
      expect(isUpgrade(PlanTier.ENTERPRISE, PlanTier.ENTERPRISE)).toBe(false);
    });

    it('ENTERPRISE -> STARTER is NOT an upgrade', () => {
      expect(isUpgrade(PlanTier.ENTERPRISE, PlanTier.STARTER)).toBe(false);
    });

    it('BUSINESS -> TRIAL is NOT an upgrade', () => {
      expect(isUpgrade(PlanTier.BUSINESS, PlanTier.TRIAL)).toBe(false);
    });
  });

  describe('isDowngrade', () => {
    it('ENTERPRISE -> BUSINESS is a downgrade', () => {
      expect(isDowngrade(PlanTier.ENTERPRISE, PlanTier.BUSINESS)).toBe(true);
    });

    it('ENTERPRISE -> STARTER is a downgrade', () => {
      expect(isDowngrade(PlanTier.ENTERPRISE, PlanTier.STARTER)).toBe(true);
    });

    it('ENTERPRISE -> TRIAL is a downgrade', () => {
      expect(isDowngrade(PlanTier.ENTERPRISE, PlanTier.TRIAL)).toBe(true);
    });

    it('BUSINESS -> STARTER is a downgrade', () => {
      expect(isDowngrade(PlanTier.BUSINESS, PlanTier.STARTER)).toBe(true);
    });

    it('BUSINESS -> TRIAL is a downgrade', () => {
      expect(isDowngrade(PlanTier.BUSINESS, PlanTier.TRIAL)).toBe(true);
    });

    it('STARTER -> TRIAL is a downgrade', () => {
      expect(isDowngrade(PlanTier.STARTER, PlanTier.TRIAL)).toBe(true);
    });

    it('same tier is NOT a downgrade', () => {
      expect(isDowngrade(PlanTier.STARTER, PlanTier.STARTER)).toBe(false);
      expect(isDowngrade(PlanTier.BUSINESS, PlanTier.BUSINESS)).toBe(false);
      expect(isDowngrade(PlanTier.TRIAL, PlanTier.TRIAL)).toBe(false);
    });

    it('STARTER -> BUSINESS is NOT a downgrade', () => {
      expect(isDowngrade(PlanTier.STARTER, PlanTier.BUSINESS)).toBe(false);
    });

    it('isUpgrade and isDowngrade are mutually exclusive for distinct tiers', () => {
      const pairs: [PlanTier, PlanTier][] = [
        [PlanTier.TRIAL, PlanTier.STARTER],
        [PlanTier.STARTER, PlanTier.BUSINESS],
        [PlanTier.BUSINESS, PlanTier.ENTERPRISE],
        [PlanTier.ENTERPRISE, PlanTier.TRIAL],
      ];

      for (const [a, b] of pairs) {
        const up = isUpgrade(a, b);
        const down = isDowngrade(a, b);
        expect(up && down).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // PLAN_CATALOG
  // ---------------------------------------------------------------------------
  describe('PLAN_CATALOG', () => {
    it('contains exactly 3 plans (STARTER, BUSINESS, ENTERPRISE)', () => {
      expect(PLAN_CATALOG).toHaveLength(3);
    });

    it('does not include TRIAL in the catalog', () => {
      const tiers = PLAN_CATALOG.map((p) => p.tier);
      expect(tiers).not.toContain(PlanTier.TRIAL);
    });

    it('includes STARTER, BUSINESS, and ENTERPRISE', () => {
      const tiers = PLAN_CATALOG.map((p) => p.tier);
      expect(tiers).toEqual(
        expect.arrayContaining([
          PlanTier.STARTER,
          PlanTier.BUSINESS,
          PlanTier.ENTERPRISE,
        ]),
      );
    });

    describe('STARTER plan entry', () => {
      const plan = PLAN_CATALOG.find((p) => p.tier === PlanTier.STARTER)!;

      it('exists in the catalog', () => {
        expect(plan).toBeDefined();
      });

      it('has name "Starter"', () => {
        expect(plan.name).toBe('Starter');
      });

      it('has monthlyPrice of 29', () => {
        expect(plan.monthlyPrice).toBe(29);
      });

      it('has yearlyPrice of 290', () => {
        expect(plan.yearlyPrice).toBe(290);
      });

      it('has addonsAvailable true', () => {
        expect(plan.addonsAvailable).toBe(true);
      });

      it('references the STARTER limits from PLAN_LIMITS', () => {
        expect(plan.limits).toBe(PLAN_LIMITS[PlanTier.STARTER]);
      });
    });

    describe('BUSINESS plan entry', () => {
      const plan = PLAN_CATALOG.find((p) => p.tier === PlanTier.BUSINESS)!;

      it('exists in the catalog', () => {
        expect(plan).toBeDefined();
      });

      it('has name "Business"', () => {
        expect(plan.name).toBe('Business');
      });

      it('has monthlyPrice of 79', () => {
        expect(plan.monthlyPrice).toBe(79);
      });

      it('has yearlyPrice of 790', () => {
        expect(plan.yearlyPrice).toBe(790);
      });

      it('has addonsAvailable true', () => {
        expect(plan.addonsAvailable).toBe(true);
      });

      it('references the BUSINESS limits from PLAN_LIMITS', () => {
        expect(plan.limits).toBe(PLAN_LIMITS[PlanTier.BUSINESS]);
      });
    });

    describe('ENTERPRISE plan entry', () => {
      const plan = PLAN_CATALOG.find((p) => p.tier === PlanTier.ENTERPRISE)!;

      it('exists in the catalog', () => {
        expect(plan).toBeDefined();
      });

      it('has name "Enterprise"', () => {
        expect(plan.name).toBe('Enterprise');
      });

      it('has monthlyPrice of 199', () => {
        expect(plan.monthlyPrice).toBe(199);
      });

      it('has yearlyPrice of 1990', () => {
        expect(plan.yearlyPrice).toBe(1990);
      });

      it('has addonsAvailable true', () => {
        expect(plan.addonsAvailable).toBe(true);
      });

      it('references the ENTERPRISE limits from PLAN_LIMITS', () => {
        expect(plan.limits).toBe(PLAN_LIMITS[PlanTier.ENTERPRISE]);
      });
    });

    it('all plans have positive monthlyPrice', () => {
      for (const plan of PLAN_CATALOG) {
        expect(plan.monthlyPrice).toBeGreaterThan(0);
      }
    });

    it('all plans have positive yearlyPrice', () => {
      for (const plan of PLAN_CATALOG) {
        expect(plan.yearlyPrice).toBeGreaterThan(0);
      }
    });

    it('yearlyPrice is less than 12x monthlyPrice (annual discount exists)', () => {
      for (const plan of PLAN_CATALOG) {
        expect(plan.yearlyPrice).toBeLessThan(plan.monthlyPrice * 12);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // PLAN_ORDER (supports isUpgrade / isDowngrade correctness)
  // ---------------------------------------------------------------------------
  describe('PLAN_ORDER', () => {
    it('TRIAL has the lowest order (0)', () => {
      expect(PLAN_ORDER[PlanTier.TRIAL]).toBe(0);
    });

    it('STARTER order is greater than TRIAL', () => {
      expect(PLAN_ORDER[PlanTier.STARTER]).toBeGreaterThan(
        PLAN_ORDER[PlanTier.TRIAL],
      );
    });

    it('BUSINESS order is greater than STARTER', () => {
      expect(PLAN_ORDER[PlanTier.BUSINESS]).toBeGreaterThan(
        PLAN_ORDER[PlanTier.STARTER],
      );
    });

    it('ENTERPRISE has the highest order', () => {
      expect(PLAN_ORDER[PlanTier.ENTERPRISE]).toBeGreaterThan(
        PLAN_ORDER[PlanTier.BUSINESS],
      );
    });

    it('all order values are unique', () => {
      const values = Object.values(PLAN_ORDER);
      const unique = new Set(values);
      expect(unique.size).toBe(values.length);
    });
  });

  // ---------------------------------------------------------------------------
  // TRIAL_DURATION_DAYS
  // ---------------------------------------------------------------------------
  describe('TRIAL_DURATION_DAYS', () => {
    it('is 30', () => {
      expect(TRIAL_DURATION_DAYS).toBe(30);
    });

    it('is a positive integer', () => {
      expect(TRIAL_DURATION_DAYS).toBeGreaterThan(0);
      expect(Number.isInteger(TRIAL_DURATION_DAYS)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // DEFAULT_ADDON_PADDLE_PRICE_IDS
  // ---------------------------------------------------------------------------
  describe('DEFAULT_ADDON_PADDLE_PRICE_IDS', () => {
    it('has entries for all four resource keys', () => {
      expect(DEFAULT_ADDON_PADDLE_PRICE_IDS).toHaveProperty('branches');
      expect(DEFAULT_ADDON_PADDLE_PRICE_IDS).toHaveProperty('workPosts');
      expect(DEFAULT_ADDON_PADDLE_PRICE_IDS).toHaveProperty('users');
      expect(DEFAULT_ADDON_PADDLE_PRICE_IDS).toHaveProperty('services');
    });

    it('all values are non-empty strings starting with "pri_"', () => {
      for (const value of Object.values(DEFAULT_ADDON_PADDLE_PRICE_IDS)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
        expect(value).toMatch(/^pri_/);
      }
    });

    it('has no overlap with plan price IDs', () => {
      const planPriceIds = new Set(Object.values(DEFAULT_PADDLE_PRICE_IDS));
      for (const addonPriceId of Object.values(
        DEFAULT_ADDON_PADDLE_PRICE_IDS,
      )) {
        expect(planPriceIds.has(addonPriceId)).toBe(false);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // ADDON_PRICE_ID_TO_RESOURCE
  // ---------------------------------------------------------------------------
  describe('ADDON_PRICE_ID_TO_RESOURCE', () => {
    it('is the exact reverse of DEFAULT_ADDON_PADDLE_PRICE_IDS', () => {
      for (const [resource, priceId] of Object.entries(
        DEFAULT_ADDON_PADDLE_PRICE_IDS,
      )) {
        expect(ADDON_PRICE_ID_TO_RESOURCE[priceId]).toBe(resource);
      }
    });

    it('has the same number of entries as DEFAULT_ADDON_PADDLE_PRICE_IDS', () => {
      expect(Object.keys(ADDON_PRICE_ID_TO_RESOURCE).length).toBe(
        Object.keys(DEFAULT_ADDON_PADDLE_PRICE_IDS).length,
      );
    });

    it('all values are valid resource keys', () => {
      const validKeys = new Set(['branches', 'workPosts', 'users', 'services']);
      for (const value of Object.values(ADDON_PRICE_ID_TO_RESOURCE)) {
        expect(validKeys.has(value)).toBe(true);
      }
    });
  });
});
