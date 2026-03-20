import { Outlet, Navigate, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { useSubscriptionStatus } from '@/features/subscription/hooks/useSubscription';
import { isTrialExpired } from '@/features/subscription/utils/trialExpiry';
import { useAuthStore } from '@/shared/stores/auth.store';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { ROUTES } from '@/shared/constants/routes';
import { Skeleton } from '@/shared/ui/skeleton';
import { Card, CardContent } from '@/shared/ui/card';

const ALLOWED_WHEN_EXPIRED = [
  ROUTES.SUBSCRIPTION,
  ROUTES.SUBSCRIPTION_PLANS,
  ROUTES.SUBSCRIPTION_BILLING,
];

function GateSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64" />
    </div>
  );
}

function ExpiredBlockingScreen() {
  const { t } = useTranslation('subscription');

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md border-2 border-destructive bg-destructive/5">
        <CardContent className="flex flex-col items-center gap-4 pt-6 text-center">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <div>
            <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
              {t('trial.badge')}
            </span>
          </div>
          <p className="text-sm font-medium text-destructive">
            {t('trial.expiredContactAdmin')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function SubscriptionGate() {
  const { data, isLoading, isError } = useSubscriptionStatus();
  const location = useLocation();
  const isSuperAdmin = useAuthStore((s) => s.user?.isSuperAdmin ?? false);
  const { hasPermission } = usePermissions();

  // Super admins always pass through
  if (isSuperAdmin) {
    return <Outlet />;
  }

  // Show skeleton while loading (prevents flash of protected content)
  if (isLoading) {
    return <GateSkeleton />;
  }

  // On error or no data → pass through (don't lock user out)
  if (isError || !data) {
    return <Outlet />;
  }

  // Check if trial is expired
  if (data.isTrial && data.trialEndsAt && isTrialExpired(data.trialEndsAt)) {
    // Users with tenants.read → redirect to /subscription (they can manage it)
    if (hasPermission(PERMISSIONS.TENANTS.READ)) {
      if (!ALLOWED_WHEN_EXPIRED.some((p) => location.pathname === p)) {
        return <Navigate to={ROUTES.SUBSCRIPTION} replace />;
      }
      return <Outlet />;
    }

    // Users without tenants.read → show blocking screen (can't manage subscription)
    return <ExpiredBlockingScreen />;
  }

  return <Outlet />;
}
