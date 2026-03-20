import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { useBillingDetails } from '../hooks/useSubscription';
import type { BillingDetails } from '../api/subscription.api';

function formatCents(cents: string, currency: string): string {
  const value = parseInt(cents, 10);
  if (isNaN(value)) return `${currency} 0.00`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value / 100);
}

function billingIntervalLabel(
  t: (key: string) => string,
  interval: string,
  frequency: number,
): string {
  if (frequency !== 1) return `${frequency} ${interval}s`;
  return interval === 'year' ? t('plans.year') : t('plans.month');
}

interface BillingContentProps {
  billing: BillingDetails;
}

function BillingContent({ billing }: BillingContentProps) {
  const { t } = useTranslation('subscription');

  const intervalLabel = billingIntervalLabel(
    t,
    billing.billingInterval,
    billing.billingFrequency,
  );
  const hasMultipleItems = billing.lineItems.length > 1;
  const discount = parseInt(billing.discountCents, 10);
  const tax = parseInt(billing.taxCents, 10);

  return (
    <>
      <ul className="space-y-2">
        {billing.lineItems.map((item, idx) => (
          <li
            key={idx}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-muted-foreground">
              {item.name}
              {item.quantity > 1 && ` ×${item.quantity}`}
            </span>
            <span>{formatCents(item.totalCents, billing.currencyCode)}</span>
          </li>
        ))}
      </ul>

      {discount > 0 && (
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('billing.discount')}</span>
          <span className="text-green-600">
            -{formatCents(billing.discountCents, billing.currencyCode)}
          </span>
        </div>
      )}

      {tax > 0 && (
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t('billing.tax')}</span>
          <span>{formatCents(billing.taxCents, billing.currencyCode)}</span>
        </div>
      )}

      {hasMultipleItems || discount > 0 || tax > 0 ? (
        <div className="mt-3 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t('billing.total')}</span>
            <span className="text-lg font-bold">
              {formatCents(billing.totalCents, billing.currencyCode)}/
              {intervalLabel}
            </span>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <span className="text-2xl font-bold">
            {formatCents(billing.totalCents, billing.currencyCode)}
          </span>
          <span className="text-sm text-muted-foreground">
            /{intervalLabel}
          </span>
        </div>
      )}

      {billing.nextBillingDate && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('billing.nextBilling', {
            date: new Date(billing.nextBillingDate).toLocaleDateString(),
          })}
        </p>
      )}
    </>
  );
}

interface BillingSummaryCardProps {
  hasActiveSubscription: boolean;
  isTrial: boolean;
}

export function BillingSummaryCard({
  hasActiveSubscription,
  isTrial,
}: BillingSummaryCardProps) {
  const { t } = useTranslation('subscription');
  const { data: billing, isLoading } = useBillingDetails(
    hasActiveSubscription && !isTrial,
  );

  if (isTrial || !hasActiveSubscription) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">
            {t('billing.summaryTitle')}
          </CardTitle>
          <Receipt className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-2 h-4 w-48" />
        </CardContent>
      </Card>
    );
  }

  if (!billing) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          {t('billing.summaryTitle')}
        </CardTitle>
        <Receipt className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <BillingContent billing={billing} />
      </CardContent>
    </Card>
  );
}
