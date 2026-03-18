import { PLAN_LIMITS, PlanTier, TRIAL_DURATION_DAYS } from './plan.constants';

export const TRIAL_DEFAULTS = {
  maxUsers: PLAN_LIMITS[PlanTier.TRIAL].users!,
  maxBranches: PLAN_LIMITS[PlanTier.TRIAL].branches!,
  maxWorkPosts: PLAN_LIMITS[PlanTier.TRIAL].workPosts!,
  maxServices: PLAN_LIMITS[PlanTier.TRIAL].services!,
  durationDays: TRIAL_DURATION_DAYS,
} as const;
