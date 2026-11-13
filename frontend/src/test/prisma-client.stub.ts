/**
 * Enum-only stand-in for `@prisma/client`.
 *
 * Contract tests import the backend plan catalogue, which imports Prisma enums.
 * The frontend CI job installs only frontend dependencies, so the generated
 * client is absent there. Values mirror the enums in `prisma/schema.prisma`.
 */
export const PlanTier = {
  TRIAL: 'TRIAL',
  STARTER: 'STARTER',
  BUSINESS: 'BUSINESS',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export const BillingInterval = {
  MONTHLY: 'MONTHLY',
  YEARLY: 'YEARLY',
} as const;

export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  PAUSED: 'PAUSED',
  CANCELLED: 'CANCELLED',
} as const;
