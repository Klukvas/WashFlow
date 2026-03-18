import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';

export type PlanTier = 'TRIAL' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';
export type BillingInterval = 'MONTHLY' | 'YEARLY';
export type SubscriptionStatusType =
  | 'TRIALING'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'PAUSED'
  | 'CANCELLED';

export interface PlanLimits {
  branches: number | null;
  workPosts: number | null;
  users: number | null;
  services: number | null;
}

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  limits: PlanLimits;
  addonsAvailable: boolean;
}

export interface AddonDefinition {
  resource: string;
  unitSize: number;
  monthlyPrice: number;
  name: string;
}

export interface PlanCatalog {
  plans: PlanDefinition[];
  addons: AddonDefinition[];
}

export interface SubscriptionAddon {
  resource: string;
  quantity: number;
}

export interface SubscriptionUsage {
  subscription: {
    planTier: PlanTier;
    status: SubscriptionStatusType;
    billingInterval: BillingInterval | null;
    maxUsers: number | null;
    maxBranches: number | null;
    maxWorkPosts: number | null;
    maxServices: number | null;
    isTrial: boolean;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    cancelEffectiveAt: string | null;
    hasActiveSubscription: boolean;
    addons: SubscriptionAddon[];
  } | null;
  usage: {
    users: { current: number; max: number | null };
    branches: { current: number; max: number | null };
    workPosts: { current: number; max: number | null };
    services: { current: number; max: number | null };
  };
}

export interface CheckoutResponse {
  transactionId: string;
  clientToken: string;
}

export interface PlanPreview {
  amount: string;
  currency: string;
  interval?: string;
  immediateTransaction?: { amount: string; currency: string };
  nextTransaction?: { amount: string; currency: string; billingDate: string };
}

export async function fetchSubscriptionUsage(): Promise<SubscriptionUsage> {
  const { data } = await apiClient.get<ApiResponse<SubscriptionUsage>>(
    '/subscription/usage',
  );
  return data.data;
}

export async function fetchPlanCatalog(): Promise<PlanCatalog> {
  const { data } = await apiClient.get<ApiResponse<PlanCatalog>>(
    '/subscription/plans',
  );
  return data.data;
}

export async function createCheckout(params: {
  planTier: PlanTier;
  billingInterval: BillingInterval;
}): Promise<CheckoutResponse> {
  const { data } = await apiClient.post<ApiResponse<CheckoutResponse>>(
    '/subscription/checkout',
    params,
  );
  return data.data;
}

export async function changePlan(params: {
  planTier: PlanTier;
  billingInterval: BillingInterval;
}): Promise<{ message: string }> {
  const { data } = await apiClient.post<ApiResponse<{ message: string }>>(
    '/subscription/change-plan',
    params,
  );
  return data.data;
}

export async function manageAddon(params: {
  resource: string;
  quantity: number;
}): Promise<unknown> {
  const { data } = await apiClient.post<ApiResponse<unknown>>(
    '/subscription/addons',
    params,
  );
  return data.data;
}

export async function previewPlanChange(params: {
  planTier: PlanTier;
  billingInterval: BillingInterval;
}): Promise<PlanPreview> {
  const { data } = await apiClient.post<ApiResponse<PlanPreview>>(
    '/subscription/preview',
    params,
  );
  return data.data;
}

export async function cancelSubscription(): Promise<{ message: string }> {
  const { data } = await apiClient.post<ApiResponse<{ message: string }>>(
    '/subscription/cancel',
  );
  return data.data;
}
