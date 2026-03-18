import { PlanTier, BillingInterval, SubscriptionStatus } from '@prisma/client';

export { PlanTier, BillingInterval, SubscriptionStatus };

export type ResourceKey = 'branches' | 'workPosts' | 'users' | 'services';

export interface PlanLimits {
  readonly branches: number | null;
  readonly workPosts: number | null;
  readonly users: number | null;
  readonly services: number | null;
}

export interface PlanDefinition {
  readonly tier: PlanTier;
  readonly name: string;
  readonly monthlyPrice: number;
  readonly yearlyPrice: number;
  readonly limits: PlanLimits;
  readonly addonsAvailable: boolean;
}

/** null = unlimited */
export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  [PlanTier.TRIAL]: { branches: 3, workPosts: 10, users: 15, services: 20 },
  [PlanTier.STARTER]: { branches: 1, workPosts: 5, users: 5, services: 15 },
  [PlanTier.BUSINESS]: {
    branches: 5,
    workPosts: 25,
    users: 25,
    services: 50,
  },
  [PlanTier.ENTERPRISE]: {
    branches: 25,
    workPosts: 100,
    users: null,
    services: null,
  },
} as const;

export const PLAN_CATALOG: readonly PlanDefinition[] = [
  {
    tier: PlanTier.STARTER,
    name: 'Starter',
    monthlyPrice: 29,
    yearlyPrice: 290,
    limits: PLAN_LIMITS[PlanTier.STARTER],
    addonsAvailable: true,
  },
  {
    tier: PlanTier.BUSINESS,
    name: 'Business',
    monthlyPrice: 79,
    yearlyPrice: 790,
    limits: PLAN_LIMITS[PlanTier.BUSINESS],
    addonsAvailable: true,
  },
  {
    tier: PlanTier.ENTERPRISE,
    name: 'Enterprise',
    monthlyPrice: 199,
    yearlyPrice: 1990,
    limits: PLAN_LIMITS[PlanTier.ENTERPRISE],
    addonsAvailable: false,
  },
] as const;

export interface AddonDefinition {
  readonly resource: ResourceKey;
  readonly unitSize: number;
  readonly monthlyPrice: number;
  readonly name: string;
}

export const ADDON_DEFINITIONS: readonly AddonDefinition[] = [
  { resource: 'branches', unitSize: 1, monthlyPrice: 15, name: 'Extra Branch' },
  {
    resource: 'workPosts',
    unitSize: 5,
    monthlyPrice: 10,
    name: 'Extra Work Posts',
  },
  { resource: 'users', unitSize: 5, monthlyPrice: 5, name: 'Extra Users' },
  {
    resource: 'services',
    unitSize: 10,
    monthlyPrice: 5,
    name: 'Extra Services',
  },
] as const;

/** Derived from ADDON_DEFINITIONS — single source of truth for unit sizes */
export const ADDON_UNIT_SIZE: Record<ResourceKey, number> = Object.fromEntries(
  ADDON_DEFINITIONS.map((d) => [d.resource, d.unitSize]),
) as Record<ResourceKey, number>;

/** Plan ordering for upgrade/downgrade comparison */
export const PLAN_ORDER: Record<PlanTier, number> = {
  [PlanTier.TRIAL]: 0,
  [PlanTier.STARTER]: 1,
  [PlanTier.BUSINESS]: 2,
  [PlanTier.ENTERPRISE]: 3,
} as const;

export const TRIAL_DURATION_DAYS = 30;

/** Default Paddle price IDs by convention: pri_{tier}_{interval} */
export const DEFAULT_PADDLE_PRICE_IDS: Readonly<Record<string, string>> = {
  starter_monthly: 'pri_starter_monthly',
  starter_yearly: 'pri_starter_yearly',
  business_monthly: 'pri_business_monthly',
  business_yearly: 'pri_business_yearly',
  enterprise_monthly: 'pri_enterprise_monthly',
  enterprise_yearly: 'pri_enterprise_yearly',
} as const;

/** Default Paddle price IDs for addon resources */
export const DEFAULT_ADDON_PADDLE_PRICE_IDS: Readonly<
  Record<ResourceKey, string>
> = {
  branches: 'pri_addon_branches',
  workPosts: 'pri_addon_work_posts',
  users: 'pri_addon_users',
  services: 'pri_addon_services',
} as const;

/**
 * Reverse mapping: Paddle addon price ID → resource key.
 * Contains DEFAULT price IDs only. Callers that respect config overrides
 * (paddle.addonPriceIds) must merge their own reverse lookup on top of this.
 * See syncAddonsFromPaddleItems() in paddle-webhook.service.ts for the pattern.
 */
export const ADDON_PRICE_ID_TO_RESOURCE: Readonly<Record<string, ResourceKey>> =
  Object.fromEntries(
    Object.entries(DEFAULT_ADDON_PADDLE_PRICE_IDS).map(
      ([resource, priceId]) => [priceId, resource as ResourceKey],
    ),
  ) as Record<string, ResourceKey>;

export function isUpgrade(from: PlanTier, to: PlanTier): boolean {
  return PLAN_ORDER[to] > PLAN_ORDER[from];
}

export function isDowngrade(from: PlanTier, to: PlanTier): boolean {
  return PLAN_ORDER[to] < PLAN_ORDER[from];
}

/**
 * Calculates effective limit for a resource given a plan tier and addon quantity.
 * Returns null for unlimited resources.
 * Does NOT enforce plan eligibility rules — callers must validate addon eligibility separately.
 */
export function calculateEffectiveLimit(
  tier: PlanTier,
  resource: ResourceKey,
  addonQuantity: number,
): number | null {
  if (addonQuantity < 0) {
    throw new Error(
      `addonQuantity must be non-negative, got ${addonQuantity} for ${resource}`,
    );
  }
  const baseLimit = PLAN_LIMITS[tier][resource];
  if (baseLimit === null) return null;
  return baseLimit + addonQuantity * ADDON_UNIT_SIZE[resource];
}
