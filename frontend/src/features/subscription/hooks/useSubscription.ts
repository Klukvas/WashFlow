import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  fetchSubscriptionStatus,
  fetchSubscriptionUsage,
  fetchPlanCatalog,
  fetchBillingDetails,
  fetchTransactions,
  createCheckout,
  changePlan,
  manageAddon,
  previewPlanChange,
  cancelSubscription,
  reactivateSubscription,
} from '../api/subscription.api';
import type { PlanTier, BillingInterval } from '../api/subscription.api';

export const subscriptionKeys = {
  all: ['subscription'] as const,
  status: () => [...subscriptionKeys.all, 'status'] as const,
  usage: () => [...subscriptionKeys.all, 'usage'] as const,
  plans: () => [...subscriptionKeys.all, 'plans'] as const,
  billing: () => [...subscriptionKeys.all, 'billing'] as const,
  transactions: () => [...subscriptionKeys.all, 'transactions'] as const,
};

/** Lightweight status check — available to ALL authenticated users (no permission needed). */
export function useSubscriptionStatus() {
  const query = useQuery({
    queryKey: subscriptionKeys.status(),
    queryFn: fetchSubscriptionStatus,
    staleTime: 5 * 60 * 1000,
  });
  return {
    ...query,
    paymentsEnabled: query.data?.paymentsEnabled ?? false,
  };
}

export function useSubscriptionUsage(options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: subscriptionKeys.usage(),
    queryFn: fetchSubscriptionUsage,
    staleTime: 5 * 60 * 1000,
    refetchInterval: options?.refetchInterval,
  });
}

export function useBillingDetails(enabled = true) {
  return useQuery({
    queryKey: subscriptionKeys.billing(),
    queryFn: fetchBillingDetails,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function usePlanCatalog() {
  return useQuery({
    queryKey: subscriptionKeys.plans(),
    queryFn: fetchPlanCatalog,
    staleTime: 30 * 60 * 1000,
  });
}

export function useCreateCheckout() {
  const { t } = useTranslation('subscription');
  return useMutation({
    mutationFn: (params: {
      planTier: PlanTier;
      billingInterval: BillingInterval;
    }) => createCheckout(params),
    onError: () => {
      toast.error(t('checkout.error'));
    },
  });
}

export function useChangePlan() {
  const { t } = useTranslation('subscription');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      planTier: PlanTier;
      billingInterval: BillingInterval;
    }) => changePlan(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
    onError: () => {
      toast.error(t('changePlan.error'));
    },
  });
}

export function useManageAddon() {
  const { t } = useTranslation('subscription');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { resource: string; quantity: number }) =>
      manageAddon(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
      toast.success(t('addons.updateSuccess'));
    },
    onError: () => {
      toast.error(t('addons.error'));
    },
  });
}

export function usePreviewPlanChange() {
  return useMutation({
    mutationFn: (params: {
      planTier: PlanTier;
      billingInterval: BillingInterval;
    }) => previewPlanChange(params),
  });
}

export function useTransactions(enabled = true) {
  return useQuery({
    queryKey: subscriptionKeys.transactions(),
    queryFn: fetchTransactions,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useCancelSubscription() {
  const { t } = useTranslation('subscription');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
    onError: () => {
      toast.error(t('cancel.error'));
    },
  });
}

export function useReactivateSubscription() {
  const { t } = useTranslation('subscription');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reactivateSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
    onError: () => {
      toast.error(t('cancel.reactivateError'));
    },
  });
}
