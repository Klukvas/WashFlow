import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchSubscriptionUsage,
  fetchPlanCatalog,
  createCheckout,
  changePlan,
  manageAddon,
  previewPlanChange,
  cancelSubscription,
} from '../subscription.api';

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import { apiClient } from '@/shared/api/client';

describe('subscription.api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // fetchSubscriptionUsage
  // -------------------------------------------------------------------------

  describe('fetchSubscriptionUsage', () => {
    it('calls GET /subscription/usage', async () => {
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
      expect(result).toEqual(mockUsage);
    });

    it('returns the nested data property', async () => {
      const usage = { subscription: null, usage: {} };
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { data: usage },
      });

      const result = await fetchSubscriptionUsage();

      expect(result).toBe(usage);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Network error'));

      await expect(fetchSubscriptionUsage()).rejects.toThrow('Network error');
    });
  });

  // -------------------------------------------------------------------------
  // fetchPlanCatalog
  // -------------------------------------------------------------------------

  describe('fetchPlanCatalog', () => {
    it('calls GET /subscription/plans', async () => {
      const catalog = { plans: [], addons: [] };
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { data: catalog },
      });

      await fetchPlanCatalog();

      expect(apiClient.get).toHaveBeenCalledWith('/subscription/plans');
    });

    it('returns the catalog data', async () => {
      const catalog = {
        plans: [{ tier: 'STARTER', name: 'Starter' }],
        addons: [{ resource: 'branches', unitSize: 1 }],
      };
      vi.mocked(apiClient.get).mockResolvedValue({
        data: { data: catalog },
      });

      const result = await fetchPlanCatalog();

      expect(result).toEqual(catalog);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.get).mockRejectedValue(new Error('Server error'));

      await expect(fetchPlanCatalog()).rejects.toThrow('Server error');
    });
  });

  // -------------------------------------------------------------------------
  // createCheckout
  // -------------------------------------------------------------------------

  describe('createCheckout', () => {
    const params = { planTier: 'STARTER' as const, billingInterval: 'MONTHLY' as const };

    it('calls POST /subscription/checkout with params', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: { transactionId: 'txn-1', clientToken: 'tok-1' } },
      });

      await createCheckout(params);

      expect(apiClient.post).toHaveBeenCalledWith('/subscription/checkout', params);
    });

    it('returns the checkout response', async () => {
      const response = { transactionId: 'txn-1', clientToken: 'tok-1' };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: response },
      });

      const result = await createCheckout(params);

      expect(result).toEqual(response);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Checkout failed'));

      await expect(createCheckout(params)).rejects.toThrow('Checkout failed');
    });
  });

  // -------------------------------------------------------------------------
  // changePlan
  // -------------------------------------------------------------------------

  describe('changePlan', () => {
    const params = { planTier: 'BUSINESS' as const, billingInterval: 'YEARLY' as const };

    it('calls POST /subscription/change-plan with params', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: { message: 'Plan change initiated.' } },
      });

      await changePlan(params);

      expect(apiClient.post).toHaveBeenCalledWith('/subscription/change-plan', params);
    });

    it('returns the message response', async () => {
      const response = { message: 'Plan change initiated.' };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: response },
      });

      const result = await changePlan(params);

      expect(result).toEqual(response);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Change failed'));

      await expect(changePlan(params)).rejects.toThrow('Change failed');
    });
  });

  // -------------------------------------------------------------------------
  // manageAddon
  // -------------------------------------------------------------------------

  describe('manageAddon', () => {
    const params = { resource: 'branches', quantity: 2 };

    it('calls POST /subscription/addons with params', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: { id: 'sub-1' } },
      });

      await manageAddon(params);

      expect(apiClient.post).toHaveBeenCalledWith('/subscription/addons', params);
    });

    it('returns the response data', async () => {
      const response = { id: 'sub-1', addons: [{ resource: 'branches', quantity: 2 }] };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: response },
      });

      const result = await manageAddon(params);

      expect(result).toEqual(response);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Addon failed'));

      await expect(manageAddon(params)).rejects.toThrow('Addon failed');
    });
  });

  // -------------------------------------------------------------------------
  // previewPlanChange
  // -------------------------------------------------------------------------

  describe('previewPlanChange', () => {
    const params = { planTier: 'STARTER' as const, billingInterval: 'MONTHLY' as const };

    it('calls POST /subscription/preview with params', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: { amount: '2900', currency: 'USD', interval: 'MONTHLY' } },
      });

      await previewPlanChange(params);

      expect(apiClient.post).toHaveBeenCalledWith('/subscription/preview', params);
    });

    it('returns the preview data', async () => {
      const response = { amount: '2900', currency: 'USD', interval: 'MONTHLY' };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: response },
      });

      const result = await previewPlanChange(params);

      expect(result).toEqual(response);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Preview failed'));

      await expect(previewPlanChange(params)).rejects.toThrow('Preview failed');
    });
  });

  // -------------------------------------------------------------------------
  // cancelSubscription
  // -------------------------------------------------------------------------

  describe('cancelSubscription', () => {
    it('calls POST /subscription/cancel', async () => {
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: { message: 'Cancellation requested.' } },
      });

      await cancelSubscription();

      expect(apiClient.post).toHaveBeenCalledWith('/subscription/cancel');
    });

    it('returns the message response', async () => {
      const response = { message: 'Cancellation requested.' };
      vi.mocked(apiClient.post).mockResolvedValue({
        data: { data: response },
      });

      const result = await cancelSubscription();

      expect(result).toEqual(response);
    });

    it('propagates errors', async () => {
      vi.mocked(apiClient.post).mockRejectedValue(new Error('Cancel failed'));

      await expect(cancelSubscription()).rejects.toThrow('Cancel failed');
    });
  });
});
