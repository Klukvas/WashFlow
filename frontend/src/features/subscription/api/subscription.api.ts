import { apiClient } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types/api';

export interface SubscriptionUsage {
  subscription: {
    maxUsers: number;
    maxBranches: number;
    maxWorkPosts: number;
    maxServices: number;
    isTrial: boolean;
    trialEndsAt: string | null;
  } | null;
  usage: {
    users: { current: number; max: number | null };
    branches: { current: number; max: number | null };
    workPosts: { current: number; max: number | null };
    services: { current: number; max: number | null };
  };
}

export async function fetchSubscriptionUsage(): Promise<SubscriptionUsage> {
  const { data } = await apiClient.get<ApiResponse<SubscriptionUsage>>(
    '/subscription/usage',
  );
  return data.data;
}
