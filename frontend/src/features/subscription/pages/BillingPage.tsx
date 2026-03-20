import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { PageHeader } from '@/shared/components/PageHeader';
import { Button } from '@/shared/ui/button';
import { Card, CardContent } from '@/shared/ui/card';
import { BillingSummaryCard } from '../components/BillingSummaryCard';
import { TransactionHistoryCard } from '../components/TransactionHistoryCard';
import {
  useSubscriptionUsage,
  useSubscriptionStatus,
} from '../hooks/useSubscription';
import { Skeleton } from '@/shared/ui/skeleton';
import { ROUTES } from '@/shared/constants/routes';

export function BillingPage() {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();
  const { paymentsEnabled } = useSubscriptionStatus();
  const { data, isLoading, isError } = useSubscriptionUsage();

  useEffect(() => {
    if (!paymentsEnabled) {
      navigate(ROUTES.SUBSCRIPTION, { replace: true });
    }
  }, [paymentsEnabled, navigate]);

  const subscription = data?.subscription;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(ROUTES.SUBSCRIPTION)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PageHeader
            title={t('billing.pageTitle')}
            description={t('billing.pageDescription')}
          />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(ROUTES.SUBSCRIPTION)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <PageHeader
            title={t('billing.pageTitle')}
            description={t('billing.pageDescription')}
          />
        </div>
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
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(ROUTES.SUBSCRIPTION)}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={t('billing.pageTitle')}
          description={t('billing.pageDescription')}
        />
      </div>

      {subscription ? (
        <>
          <BillingSummaryCard
            hasActiveSubscription={subscription.hasActiveSubscription}
            isTrial={subscription.isTrial}
          />
          <TransactionHistoryCard
            hasActiveSubscription={subscription.hasActiveSubscription}
            isTrial={subscription.isTrial}
          />
        </>
      ) : null}
    </div>
  );
}
