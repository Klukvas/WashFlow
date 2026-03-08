import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchSubscriptionUsage } from '../subscription.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

import { apiClient } from '@/shared/api/client';

describe('subscription.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetchSubscriptionUsage calls GET /subscription/usage', async () => {
    const mockUsage = {
      subscription: {
        maxUsers: 15,
        maxBranches: 3,
        maxWorkPosts: 10,
        maxServices: 20,
        isTrial: true,
        trialEndsAt: '2026-04-08T00:00:00Z',
      },
      usage: {
        users: { current: 2, max: 15 },
        branches: { current: 1, max: 3 },
        workPosts: { current: 2, max: 10 },
        services: { current: 5, max: 20 },
      },
    };
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { data: mockUsage },
    });

    const result = await fetchSubscriptionUsage();

    expect(apiClient.get).toHaveBeenCalledWith('/subscription/usage');
    expect(result.subscription?.isTrial).toBe(true);
    expect(result.usage.users.current).toBe(2);
  });
});
