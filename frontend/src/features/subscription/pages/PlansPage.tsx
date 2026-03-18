import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AlertCircle } from 'lucide-react';
import { initializePaddle } from '@paddle/paddle-js';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  usePlanCatalog,
  useSubscriptionUsage,
  useCreateCheckout,
  useChangePlan,
} from '../hooks/useSubscription';
import { PlanCard } from '../components/PlanCard';
import type { PlanTier, BillingInterval } from '../api/subscription.api';

const PADDLE_SANDBOX = import.meta.env.VITE_PADDLE_SANDBOX === 'true';

export function PlansPage() {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>('MONTHLY');

  const { data: catalog, isLoading: catalogLoading } = usePlanCatalog();
  const { data: usage, isLoading: usageLoading } = useSubscriptionUsage();
  const createCheckout = useCreateCheckout();
  const changePlanMutation = useChangePlan();

  const isLoading = catalogLoading || usageLoading;
  const currentTier = usage?.subscription?.planTier;
  const hasActiveSubscription = !!usage?.subscription?.hasActiveSubscription;

  const handleSelectPlan = useCallback(
    async (tier: PlanTier) => {
      try {
        if (hasActiveSubscription) {
          await changePlanMutation.mutateAsync({
            planTier: tier,
            billingInterval,
          });
          navigate('/subscription');
        } else {
          const checkoutData = await createCheckout.mutateAsync({
            planTier: tier,
            billingInterval,
          });

          const paddle = await initializePaddle({
            token: checkoutData.clientToken,
            environment: PADDLE_SANDBOX ? 'sandbox' : 'production',
          });

          if (paddle && checkoutData.transactionId) {
            paddle.Checkout.open({ transactionId: checkoutData.transactionId });
          }
        }
      } catch {
        // Global onError handler in QueryClient already shows toast
      }
    },
    [
      hasActiveSubscription,
      billingInterval,
      changePlanMutation,
      createCheckout,
      navigate,
    ],
  );

  if (isLoading) {
    return (
      <div>
        <PageHeader title={t('plans.title')} />
        <div className="grid gap-6 md:grid-cols-3">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div>
        <PageHeader title={t('plans.title')} />
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">{t('loadError')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('plans.title')}
        description={t('plans.description')}
      />

      {/* Billing interval toggle */}
      <div className="mb-8 flex justify-center gap-2">
        <Button
          variant={billingInterval === 'MONTHLY' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBillingInterval('MONTHLY')}
        >
          {t('plans.monthly')}
        </Button>
        <Button
          variant={billingInterval === 'YEARLY' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setBillingInterval('YEARLY')}
        >
          {t('plans.yearly')}
        </Button>
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {catalog.plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billingInterval={billingInterval}
            currentTier={currentTier}
            onSelect={handleSelectPlan}
            isLoading={createCheckout.isPending || changePlanMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
