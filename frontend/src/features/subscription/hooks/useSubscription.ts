import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchSubscriptionUsage,
  fetchPlanCatalog,
  createCheckout,
  changePlan,
  manageAddon,
  previewPlanChange,
  cancelSubscription,
} from '../api/subscription.api';
import type { PlanTier, BillingInterval } from '../api/subscription.api';

export const subscriptionKeys = {
  all: ['subscription'] as const,
  usage: () => [...subscriptionKeys.all, 'usage'] as const,
  plans: () => [...subscriptionKeys.all, 'plans'] as const,
};

export function useSubscriptionUsage() {
  return useQuery({
    queryKey: subscriptionKeys.usage(),
    queryFn: fetchSubscriptionUsage,
    staleTime: 5 * 60 * 1000,
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      planTier: PlanTier;
      billingInterval: BillingInterval;
    }) => createCheckout(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create checkout session');
    },
  });
}

export function useChangePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      planTier: PlanTier;
      billingInterval: BillingInterval;
    }) => changePlan(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to change plan');
    },
  });
}

export function useManageAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { resource: string; quantity: number }) =>
      manageAddon(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.usage() });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to manage add-on');
    },
  });
}

export function usePreviewPlanChange() {
  return useMutation({
    mutationFn: (params: {
      planTier: PlanTier;
      billingInterval: BillingInterval;
    }) => previewPlanChange(params),
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to preview plan change');
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelSubscription,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to cancel subscription');
    },
  });
}
