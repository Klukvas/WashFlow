import { useQuery } from '@tanstack/react-query';
import { fetchSubscriptionUsage } from '../api/subscription.api';

export const subscriptionKeys = {
  all: ['subscription'] as const,
  usage: () => [...subscriptionKeys.all, 'usage'] as const,
};

export function useSubscriptionUsage() {
  return useQuery({
    queryKey: subscriptionKeys.usage(),
    queryFn: fetchSubscriptionUsage,
    staleTime: 5 * 60 * 1000,
  });
}
