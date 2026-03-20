import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  subscriptionKeys,
  useSubscriptionUsage,
  usePlanCatalog,
  useCreateCheckout,
  useChangePlan,
  useManageAddon,
  usePreviewPlanChange,
  useCancelSubscription,
} from '../useSubscription';

vi.mock('../../api/subscription.api', () => ({
  fetchSubscriptionUsage: vi.fn(),
  fetchPlanCatalog: vi.fn(),
  createCheckout: vi.fn(),
  changePlan: vi.fn(),
  manageAddon: vi.fn(),
  previewPlanChange: vi.fn(),
  cancelSubscription: vi.fn(),
}));

import {
  fetchSubscriptionUsage,
  fetchPlanCatalog,
  createCheckout,
  changePlan,
  manageAddon,
  previewPlanChange,
  cancelSubscription,
} from '../../api/subscription.api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

// ---------------------------------------------------------------------------
// subscriptionKeys
// ---------------------------------------------------------------------------

describe('subscriptionKeys', () => {
  it('has correct all key', () => {
    expect(subscriptionKeys.all).toEqual(['subscription']);
  });

  it('has correct usage key', () => {
    expect(subscriptionKeys.usage()).toEqual(['subscription', 'usage']);
  });

  it('has correct plans key', () => {
    expect(subscriptionKeys.plans()).toEqual(['subscription', 'plans']);
  });

  it('usage key starts with all key', () => {
    const usage = subscriptionKeys.usage();
    expect(usage[0]).toBe(subscriptionKeys.all[0]);
  });
});

// ---------------------------------------------------------------------------
// useSubscriptionUsage
// ---------------------------------------------------------------------------

describe('useSubscriptionUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches usage on mount', async () => {
    const mockData = { subscription: null, usage: {} };
    vi.mocked(fetchSubscriptionUsage).mockResolvedValue(mockData as never);
    const qc = createTestClient();

    const { result } = renderHook(() => useSubscriptionUsage(), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchSubscriptionUsage).toHaveBeenCalledTimes(1);
  });

  it('returns fetched data', async () => {
    const mockData = {
      subscription: { planTier: 'STARTER' as const },
      usage: { users: { current: 2, max: 5 } },
    };
    vi.mocked(fetchSubscriptionUsage).mockResolvedValue(mockData as never);
    const qc = createTestClient();

    const { result } = renderHook(() => useSubscriptionUsage(), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockData);
  });

  it('handles errors', async () => {
    vi.mocked(fetchSubscriptionUsage).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => useSubscriptionUsage(), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// usePlanCatalog
// ---------------------------------------------------------------------------

describe('usePlanCatalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches catalog on mount', async () => {
    vi.mocked(fetchPlanCatalog).mockResolvedValue({ plans: [], addons: [] });
    const qc = createTestClient();

    const { result } = renderHook(() => usePlanCatalog(), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchPlanCatalog).toHaveBeenCalledTimes(1);
  });

  it('returns catalog data', async () => {
    const catalog = { plans: [{ tier: 'STARTER' }], addons: [] };
    vi.mocked(fetchPlanCatalog).mockResolvedValue(catalog as never);
    const qc = createTestClient();

    const { result } = renderHook(() => usePlanCatalog(), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(catalog);
  });

  it('handles errors', async () => {
    vi.mocked(fetchPlanCatalog).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => usePlanCatalog(), {
      wrapper: createWrapper(qc),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useCreateCheckout
// ---------------------------------------------------------------------------

describe('useCreateCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls createCheckout API', async () => {
    const response = { transactionId: 'txn-1', clientToken: 'tok-1' };
    vi.mocked(createCheckout).mockResolvedValue(response);
    const qc = createTestClient();

    const { result } = renderHook(() => useCreateCheckout(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'STARTER',
        billingInterval: 'MONTHLY',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createCheckout).toHaveBeenCalledWith({
      planTier: 'STARTER',
      billingInterval: 'MONTHLY',
    });
  });

  it('does not invalidate queries on success (checkout handled by Paddle UI)', async () => {
    vi.mocked(createCheckout).mockResolvedValue({
      transactionId: 'txn-1',
      clientToken: 'tok-1',
    });
    const qc = createTestClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCreateCheckout(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'STARTER',
        billingInterval: 'MONTHLY',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('handles errors', async () => {
    vi.mocked(createCheckout).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => useCreateCheckout(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'STARTER',
        billingInterval: 'MONTHLY',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useChangePlan
// ---------------------------------------------------------------------------

describe('useChangePlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls changePlan API', async () => {
    vi.mocked(changePlan).mockResolvedValue({ message: 'ok' });
    const qc = createTestClient();

    const { result } = renderHook(() => useChangePlan(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'BUSINESS',
        billingInterval: 'YEARLY',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(changePlan).toHaveBeenCalledWith({
      planTier: 'BUSINESS',
      billingInterval: 'YEARLY',
    });
  });

  it('invalidates subscription queries on success', async () => {
    vi.mocked(changePlan).mockResolvedValue({ message: 'ok' });
    const qc = createTestClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useChangePlan(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'BUSINESS',
        billingInterval: 'YEARLY',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: subscriptionKeys.all,
    });
  });

  it('handles errors', async () => {
    vi.mocked(changePlan).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => useChangePlan(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'BUSINESS',
        billingInterval: 'YEARLY',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useManageAddon
// ---------------------------------------------------------------------------

describe('useManageAddon', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls manageAddon API', async () => {
    vi.mocked(manageAddon).mockResolvedValue({ id: 'sub-1' });
    const qc = createTestClient();

    const { result } = renderHook(() => useManageAddon(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ resource: 'branches', quantity: 2 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(manageAddon).toHaveBeenCalledWith({
      resource: 'branches',
      quantity: 2,
    });
  });

  it('invalidates usage queries on success', async () => {
    vi.mocked(manageAddon).mockResolvedValue({ id: 'sub-1' });
    const qc = createTestClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useManageAddon(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ resource: 'branches', quantity: 2 });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: subscriptionKeys.all,
    });
  });

  it('handles errors', async () => {
    vi.mocked(manageAddon).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => useManageAddon(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({ resource: 'branches', quantity: 2 });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// usePreviewPlanChange
// ---------------------------------------------------------------------------

describe('usePreviewPlanChange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls previewPlanChange API', async () => {
    const preview = { amount: '2900', currency: 'USD', interval: 'MONTHLY' };
    vi.mocked(previewPlanChange).mockResolvedValue(preview);
    const qc = createTestClient();

    const { result } = renderHook(() => usePreviewPlanChange(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'STARTER',
        billingInterval: 'MONTHLY',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(previewPlanChange).toHaveBeenCalledWith({
      planTier: 'STARTER',
      billingInterval: 'MONTHLY',
    });
  });

  it('does NOT invalidate queries on success', async () => {
    vi.mocked(previewPlanChange).mockResolvedValue({
      amount: '2900',
      currency: 'USD',
    } as never);
    const qc = createTestClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => usePreviewPlanChange(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'STARTER',
        billingInterval: 'MONTHLY',
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('handles errors', async () => {
    vi.mocked(previewPlanChange).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => usePreviewPlanChange(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate({
        planTier: 'STARTER',
        billingInterval: 'MONTHLY',
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// useCancelSubscription
// ---------------------------------------------------------------------------

describe('useCancelSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls cancelSubscription API', async () => {
    vi.mocked(cancelSubscription).mockResolvedValue({ message: 'ok' });
    const qc = createTestClient();

    const { result } = renderHook(() => useCancelSubscription(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(cancelSubscription).toHaveBeenCalledTimes(1);
  });

  it('invalidates subscription queries on success', async () => {
    vi.mocked(cancelSubscription).mockResolvedValue({ message: 'ok' });
    const qc = createTestClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    const { result } = renderHook(() => useCancelSubscription(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: subscriptionKeys.all,
    });
  });

  it('handles errors', async () => {
    vi.mocked(cancelSubscription).mockRejectedValue(new Error('fail'));
    const qc = createTestClient();

    const { result } = renderHook(() => useCancelSubscription(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
