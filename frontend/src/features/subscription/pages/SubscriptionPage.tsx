import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Users,
  Building2,
  Columns3,
  Wrench,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useSubscriptionUsage } from '../hooks/useSubscription';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { cn } from '@/shared/utils/cn';

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

function TrialBanner({ trialEndsAt }: { trialEndsAt: string }) {
  const { t } = useTranslation('subscription');
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
  const isExpired = daysRemaining <= 0;

  return (
    <Card
      className={cn(
        'mb-4',
        isExpired
          ? 'border-destructive/50 bg-destructive/5'
          : 'border-yellow-500/50 bg-yellow-500/5',
      )}
    >
      <CardContent className="flex items-center gap-3 pt-6">
        <Clock
          className={cn(
            'h-5 w-5',
            isExpired ? 'text-destructive' : 'text-yellow-500',
          )}
        />
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'rounded-md px-2 py-0.5 text-xs font-medium',
              isExpired
                ? 'bg-destructive/10 text-destructive'
                : 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
            )}
          >
            {t('trial.badge')}
          </span>
          <p className="text-sm text-muted-foreground">
            {isExpired
              ? t('trial.expired')
              : t('trial.active', { count: daysRemaining })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

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

export function SubscriptionPage() {
  const { t } = useTranslation('subscription');
  const { data, isLoading, isError } = useSubscriptionUsage();

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

  return (
    <div>
      <PageHeader title={t('title')} description={t('description')} />
      {subscription?.isTrial && subscription.trialEndsAt && (
        <TrialBanner trialEndsAt={subscription.trialEndsAt} />
      )}
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
    </div>
  );
}
