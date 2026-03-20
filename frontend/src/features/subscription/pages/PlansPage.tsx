import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { AlertCircle, Info } from 'lucide-react';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/shared/stores/auth.store';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import {
  usePlanCatalog,
  useSubscriptionUsage,
  useSubscriptionStatus,
  useCreateCheckout,
  useChangePlan,
  useReactivateSubscription,
  subscriptionKeys,
} from '../hooks/useSubscription';
import { PlanCard } from '../components/PlanCard';
import {
  DowngradeBlockedDialog,
  type Violation,
  type LostAddon,
} from '../components/DowngradeBlockedDialog';
import { buildViolations } from '../utils/downgradeValidation';
import {
  CheckoutResultDialog,
  type CheckoutStatus,
} from '../components/CheckoutResultDialog';
import type { PlanTier, BillingInterval } from '../api/subscription.api';

const PLAN_ORDER: Record<PlanTier, number> = {
  TRIAL: 0,
  STARTER: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
};

const PADDLE_SANDBOX = import.meta.env.VITE_PADDLE_SANDBOX === 'true';

export function PlansPage() {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const userEmail = useAuthStore((s) => s.user?.email);
  const [billingInterval, setBillingInterval] =
    useState<BillingInterval>('MONTHLY');
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>('idle');
  const paddleRef = useRef<Paddle | null>(null);
  const paddleInitAttemptedRef = useRef(false);
  const checkoutTerminalRef = useRef(false);
  const [downgradeViolations, setDowngradeViolations] = useState<Violation[]>(
    [],
  );
  const [downgradeLostAddons, setDowngradeLostAddons] = useState<LostAddon[]>(
    [],
  );
  const [downgradeTargetPlan, setDowngradeTargetPlan] = useState('');
  const [downgradeTargetTier, setDowngradeTargetTier] =
    useState<PlanTier | null>(null);
  const showDowngradeDialog =
    downgradeViolations.length > 0 || downgradeLostAddons.length > 0;

  const { paymentsEnabled } = useSubscriptionStatus();
  const { data: catalog, isLoading: catalogLoading } = usePlanCatalog();
  const { data: usage, isLoading: usageLoading } = useSubscriptionUsage();
  const createCheckout = useCreateCheckout();
  const changePlanMutation = useChangePlan();
  const reactivateMutation = useReactivateSubscription();

  const isLoading = catalogLoading || usageLoading;
  const currentTier = usage?.subscription?.planTier;
  const hasActiveSubscription = !!usage?.subscription?.hasActiveSubscription;
  const isCancelled = usage?.subscription?.status === 'CANCELLED';

  const proceedWithChange = useCallback(
    async (tier: PlanTier) => {
      try {
        if (isCancelled && tier === currentTier) {
          // Reactivate same plan — undo scheduled cancellation
          await reactivateMutation.mutateAsync();
          navigate('/subscription', {
            state: { activated: true, fromTier: currentTier },
          });
        } else if (hasActiveSubscription) {
          await changePlanMutation.mutateAsync({
            planTier: tier,
            billingInterval,
          });
          navigate('/subscription', {
            state: { activated: true, fromTier: currentTier },
          });
        } else {
          const checkoutData = await createCheckout.mutateAsync({
            planTier: tier,
            billingInterval,
          });

          if (!paddleInitAttemptedRef.current) {
            paddleInitAttemptedRef.current = true;
            const paddle = await initializePaddle({
              token: checkoutData.clientToken,
              environment: PADDLE_SANDBOX ? 'sandbox' : 'production',
              eventCallback: (event) => {
                switch (event.name) {
                  case 'checkout.completed':
                    checkoutTerminalRef.current = true;
                    setCheckoutStatus('success');
                    queryClient.invalidateQueries({
                      queryKey: subscriptionKeys.all,
                    });
                    break;
                  case 'checkout.payment.failed':
                    checkoutTerminalRef.current = true;
                    setCheckoutStatus('error');
                    break;
                  case 'checkout.closed':
                    if (!checkoutTerminalRef.current) {
                      setCheckoutStatus('idle');
                    }
                    break;
                }
              },
            });
            paddleRef.current = paddle ?? null;
          }

          if (paddleRef.current && checkoutData.transactionId) {
            checkoutTerminalRef.current = false;
            setCheckoutStatus('processing');
            paddleRef.current.Checkout.open({
              transactionId: checkoutData.transactionId,
              ...(userEmail ? { customer: { email: userEmail } } : {}),
              settings: { allowLogout: false },
            });
          }
        }
      } catch {
        setCheckoutStatus((prev) => (prev === 'processing' ? 'error' : prev));
      }
    },
    [
      isCancelled,
      currentTier,
      hasActiveSubscription,
      billingInterval,
      userEmail,
      reactivateMutation,
      changePlanMutation,
      createCheckout,
      navigate,
      queryClient,
    ],
  );

  const handleSelectPlan = useCallback(
    (tier: PlanTier) => {
      // Pre-validate downgrade: check violations & lost add-ons
      if (
        currentTier &&
        catalog &&
        usage &&
        PLAN_ORDER[currentTier] > PLAN_ORDER[tier]
      ) {
        const targetPlan = catalog.plans.find((p) => p.tier === tier);
        if (targetPlan) {
          const violations = buildViolations(usage.usage, targetPlan.limits);

          // Detect add-ons that will be lost if target plan doesn't support them
          const activeAddons = usage.subscription?.addons ?? [];
          const lostAddons: LostAddon[] = !targetPlan.addonsAvailable
            ? activeAddons.map((a) => {
                const addonDef = catalog.addons.find(
                  (d) => d.resource === a.resource,
                );
                return {
                  resource: a.resource,
                  name: addonDef?.name ?? a.resource,
                  quantity: a.quantity,
                };
              })
            : [];

          if (violations.length > 0 || lostAddons.length > 0) {
            setDowngradeViolations(violations);
            setDowngradeLostAddons(lostAddons);
            setDowngradeTargetPlan(targetPlan.name);
            setDowngradeTargetTier(tier);
            return;
          }
        }
      }

      proceedWithChange(tier);
    },
    [currentTier, catalog, usage, proceedWithChange],
  );

  const handleCloseDowngradeDialog = useCallback(() => {
    setDowngradeViolations([]);
    setDowngradeLostAddons([]);
    setDowngradeTargetTier(null);
  }, []);

  const handleConfirmDowngrade = useCallback(() => {
    if (downgradeTargetTier) {
      handleCloseDowngradeDialog();
      proceedWithChange(downgradeTargetTier);
    }
  }, [downgradeTargetTier, handleCloseDowngradeDialog, proceedWithChange]);

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

      {/* Payments disabled banner */}
      {!paymentsEnabled && (
        <Card className="mb-6 border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <Info className="h-5 w-5 shrink-0 text-yellow-600" />
            <div>
              <p className="text-sm font-medium">{t('paymentsDisabled')}</p>
              <p className="text-xs text-muted-foreground">
                {t('paymentsDisabledHint')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {catalog.plans.map((plan) => (
          <PlanCard
            key={plan.tier}
            plan={plan}
            billingInterval={billingInterval}
            currentTier={currentTier}
            isCancelled={isCancelled}
            onSelect={handleSelectPlan}
            isLoading={
              createCheckout.isPending ||
              changePlanMutation.isPending ||
              reactivateMutation.isPending
            }
            paymentsEnabled={paymentsEnabled}
          />
        ))}
      </div>

      <DowngradeBlockedDialog
        open={showDowngradeDialog}
        onClose={handleCloseDowngradeDialog}
        onConfirm={handleConfirmDowngrade}
        planName={downgradeTargetPlan}
        violations={downgradeViolations}
        lostAddons={downgradeLostAddons}
        isLoading={changePlanMutation.isPending}
      />

      <CheckoutResultDialog
        status={checkoutStatus}
        fromTier={currentTier}
        onClose={() => setCheckoutStatus('idle')}
      />
    </div>
  );
}
