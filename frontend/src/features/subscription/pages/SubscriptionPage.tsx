import { useState, useEffect, useCallback, type ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router';
import {
  Users,
  Building2,
  Columns3,
  Wrench,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Receipt,
  Copy,
  Check,
} from 'lucide-react';
import {
  useSubscriptionUsage,
  useSubscriptionStatus,
  usePlanCatalog,
  useManageAddon,
  useCancelSubscription,
} from '../hooks/useSubscription';
import { useAuthStore } from '@/shared/stores/auth.store';
import { isTrialExpired } from '../utils/trialExpiry';
import { AddonManager } from '../components/AddonManager';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import type { PlanTier } from '../api/subscription.api';

interface ResourceCardProps {
  icon: ElementType;
  label: string;
  current: number;
  max: number | null;
}

function ResourceCard({ icon: Icon, label, current, max }: ResourceCardProps) {
  const { t } = useTranslation('subscription');

  if (max === null) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <Icon className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{current}</div>
          <p className="text-xs text-muted-foreground">{t('noLimits')}</p>
        </CardContent>
      </Card>
    );
  }

  const percentage = max > 0 ? Math.round((current / max) * 100) : 0;
  const barColor =
    percentage >= 100
      ? 'bg-destructive'
      : percentage >= 80
        ? 'bg-yellow-500'
        : 'bg-primary';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {current} / {max}
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-muted">
          <div
            role="progressbar"
            aria-valuenow={percentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${percentage}%`}
            className={cn('h-2 rounded-full transition-all', barColor)}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {percentage}% {t('used')}
        </p>
      </CardContent>
    </Card>
  );
}

function TrialBanner({
  trialEndsAt,
  onViewPlans,
  paymentsEnabled,
}: {
  trialEndsAt: string;
  onViewPlans: () => void;
  paymentsEnabled: boolean;
}) {
  const { t } = useTranslation('subscription');
  const expired = isTrialExpired(trialEndsAt);

  if (expired) {
    return (
      <Card className="mb-4 border-2 border-destructive bg-destructive/5">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {t('trial.badge')}
                </span>
              </div>
              <p className="mt-1 text-sm font-medium text-destructive">
                {t('trial.expiredBlocking')}
              </p>
            </div>
          </div>
          {paymentsEnabled && (
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0"
              onClick={onViewPlans}
            >
              {t('upgrade.button')}
              <ArrowUpRight className="ml-1 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const endDate = new Date(trialEndsAt);
  if (isNaN(endDate.getTime())) {
    return null;
  }

  const now = new Date();
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const endUtcDay = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate(),
  );
  const nowUtcDay = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const daysRemaining = Math.ceil((endUtcDay - nowUtcDay) / MS_PER_DAY);

  return (
    <Card className="mb-4 border-yellow-500/50 bg-yellow-500/5">
      <CardContent className="flex items-center gap-3 pt-6">
        <Clock className="h-5 w-5 text-yellow-500" />
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
            {t('trial.badge')}
          </span>
          <p className="text-sm text-muted-foreground">
            {t('trial.active', { count: daysRemaining })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

const PLAN_TIER_COLORS: Record<PlanTier, string> = {
  TRIAL: 'bg-warning/10 text-warning',
  STARTER: 'bg-primary/10 text-primary',
  BUSINESS: 'bg-primary/10 text-primary',
  ENTERPRISE: 'bg-success/10 text-success',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-success/10 text-success',
  TRIALING: 'bg-warning/10 text-warning',
  PAST_DUE: 'bg-destructive/10 text-destructive',
  PAUSED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-destructive/10 text-destructive',
};

function SubscriptionSkeleton() {
  return (
    <div>
      <div className="mb-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-2 h-4 w-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

function TenantIdCard({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation('subscription');
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tenantId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied — silently ignore
    }
  };

  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t('tenantId.title')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('tenantId.description')}
          </p>
          <code className="mt-2 block truncate rounded bg-muted px-3 py-1.5 font-mono text-sm">
            {tenantId}
          </code>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="ml-4 shrink-0 gap-1.5"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4 text-success" />
              {t('tenantId.copied')}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              {t('tenantId.title')}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

const POLL_INTERVAL = 2_000;
const POLL_TIMEOUT = 30_000;

interface ActivatedState {
  activated?: boolean;
  fromTier?: string;
}

export function SubscriptionPage() {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const navState = location.state as ActivatedState | null;
  const [polling, setPolling] = useState(!!navState?.activated);
  const [fromTier] = useState(navState?.fromTier);

  const { paymentsEnabled } = useSubscriptionStatus();
  const { data, isLoading, isError } = useSubscriptionUsage({
    refetchInterval: polling ? POLL_INTERVAL : undefined,
  });
  const { data: catalog } = usePlanCatalog();
  const manageAddonMutation = useManageAddon();
  const cancelMutation = useCancelSubscription();
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const clearPolling = useCallback(() => {
    setPolling(false);
    navigate(location.pathname, { replace: true, state: {} });
  }, [navigate, location.pathname]);

  // Stop polling once the plan tier changes from what it was before checkout
  const planTier = data?.subscription?.planTier;
  useEffect(() => {
    if (!polling || !planTier || !fromTier) return;
    if (planTier !== fromTier) {
      queueMicrotask(clearPolling);
    }
  }, [polling, planTier, fromTier, clearPolling]);

  // Hard timeout — stop polling after POLL_TIMEOUT regardless
  useEffect(() => {
    if (!polling) return;
    const timer = setTimeout(clearPolling, POLL_TIMEOUT);
    return () => clearTimeout(timer);
  }, [polling, clearPolling]);

  if (isLoading) {
    return <SubscriptionSkeleton />;
  }

  if (isError || !data) {
    return (
      <div>
        <PageHeader title={t('title')} />
        <Card className="border-destructive/50">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-muted-foreground">{t('loadError')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { usage, subscription } = data;
  const canManageAddons =
    subscription &&
    subscription.planTier !== 'TRIAL' &&
    subscription.status !== 'CANCELLED';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t('title')} description={t('description')} />
        <div className="flex items-center gap-2">
          {subscription && (
            <>
              <Badge className={PLAN_TIER_COLORS[subscription.planTier] ?? ''}>
                {subscription.planTier}
              </Badge>
              <Badge className={STATUS_COLORS[subscription.status] ?? ''}>
                {t(`status.${subscription.status}`)}
              </Badge>
            </>
          )}
        </div>
      </div>

      {/* Tenant ID for widget integration */}
      {user?.tenantId && <TenantIdCard tenantId={user.tenantId} />}

      {/* Trial banner */}
      {subscription?.isTrial && subscription.trialEndsAt && (
        <TrialBanner
          trialEndsAt={subscription.trialEndsAt}
          onViewPlans={() => navigate('/subscription/plans')}
          paymentsEnabled={paymentsEnabled}
        />
      )}

      {/* Change plan CTA */}
      {paymentsEnabled &&
        subscription &&
        subscription.status !== 'CANCELLED' && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">{t('upgrade.title')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('upgrade.description')}
                </p>
              </div>
              <Button onClick={() => navigate('/subscription/plans')}>
                {t('upgrade.button')}
                <ArrowUpRight className="ml-1 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        )}

      {/* Billing link */}
      {paymentsEnabled &&
        subscription &&
        subscription.hasActiveSubscription &&
        !subscription.isTrial && (
          <Card
            className="cursor-pointer transition-colors hover:bg-muted/50"
            onClick={() => navigate('/subscription/billing')}
          >
            <CardContent className="flex items-center justify-between pt-6">
              <div className="flex items-center gap-3">
                <Receipt className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">
                    {t('billing.summaryTitle')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('billing.viewDetails')}
                  </p>
                </div>
              </div>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardContent>
          </Card>
        )}

      {/* Resource usage cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ResourceCard
          icon={Users}
          label={t('resources.users')}
          current={usage.users.current}
          max={usage.users.max}
        />
        <ResourceCard
          icon={Building2}
          label={t('resources.branches')}
          current={usage.branches.current}
          max={usage.branches.max}
        />
        <ResourceCard
          icon={Columns3}
          label={t('resources.workPosts')}
          current={usage.workPosts.current}
          max={usage.workPosts.max}
        />
        <ResourceCard
          icon={Wrench}
          label={t('resources.services')}
          current={usage.services.current}
          max={usage.services.max}
        />
      </div>

      {/* Add-on management */}
      {paymentsEnabled && canManageAddons && catalog && (
        <AddonManager
          addons={catalog.addons}
          currentAddons={subscription.addons}
          onUpdate={(resource, quantity) =>
            manageAddonMutation.mutate({ resource, quantity })
          }
          isLoading={manageAddonMutation.isPending}
        />
      )}

      {/* Cancel subscription */}
      {paymentsEnabled &&
        subscription &&
        subscription.status === 'ACTIVE' &&
        !subscription.isTrial && (
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm font-medium">{t('cancel.title')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('cancel.description')}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelMutation.isPending}
              >
                {t('cancel.button')}
              </Button>
            </CardContent>
          </Card>
        )}

      <ConfirmDialog
        open={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={() => {
          cancelMutation.mutate(undefined, {
            onSettled: () => setShowCancelConfirm(false),
          });
        }}
        title={t('cancel.confirmTitle')}
        message={t('cancel.confirmMessage')}
        variant="destructive"
        loading={cancelMutation.isPending}
      />

      {/* Cancellation info + choose plan */}
      {subscription?.status === 'CANCELLED' &&
        subscription.cancelEffectiveAt && (
          <Card className="border-yellow-500/50">
            <CardContent className="flex items-center justify-between pt-6">
              <p className="text-sm text-muted-foreground">
                {t('cancel.activeUntil', {
                  date: new Date(
                    subscription.cancelEffectiveAt,
                  ).toLocaleDateString(),
                })}
              </p>
              {paymentsEnabled && (
                <Button
                  size="sm"
                  onClick={() => navigate('/subscription/plans')}
                >
                  {t('cancel.reactivate')}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
    </div>
  );
}
