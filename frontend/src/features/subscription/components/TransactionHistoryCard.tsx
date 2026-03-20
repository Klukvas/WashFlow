import { useTranslation } from 'react-i18next';
import { History, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { useTransactions } from '../hooks/useSubscription';
import type { Transaction } from '../api/subscription.api';

function formatCents(cents: string, currency: string): string {
  const value = parseInt(cents, 10);
  if (isNaN(value)) return `${currency} 0.00`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(value / 100);
}

function statusVariant(
  status: string,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
    case 'paid':
      return 'default';
    case 'pending':
    case 'ready':
      return 'secondary';
    case 'past_due':
    case 'failed':
      return 'destructive';
    default:
      return 'outline';
  }
}

const INITIAL_VISIBLE = 5;

function TransactionRow({ txn }: { txn: Transaction }) {
  const { t } = useTranslation('subscription');
  const date = new Date(txn.createdAt).toLocaleDateString();
  const itemNames = txn.lineItems.map((li) => li.name).join(', ');

  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">
          {itemNames || t('transactions.payment')}
        </p>
        <p className="text-xs text-muted-foreground">{date}</p>
        {txn.billingPeriod && (
          <p className="text-xs text-muted-foreground">
            {new Date(txn.billingPeriod.startsAt).toLocaleDateString()} –{' '}
            {new Date(txn.billingPeriod.endsAt).toLocaleDateString()}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={statusVariant(txn.status)}>{txn.status}</Badge>
        <span className="text-sm font-medium">
          {formatCents(txn.totalCents, txn.currency)}
        </span>
      </div>
    </div>
  );
}

interface TransactionHistoryCardProps {
  hasActiveSubscription: boolean;
  isTrial: boolean;
}

export function TransactionHistoryCard({
  hasActiveSubscription,
  isTrial,
}: TransactionHistoryCardProps) {
  const { t } = useTranslation('subscription');
  const { data: transactions, isLoading } = useTransactions(
    hasActiveSubscription && !isTrial,
  );
  const [expanded, setExpanded] = useState(false);

  if (isTrial || !hasActiveSubscription) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">
            {t('transactions.title')}
          </CardTitle>
          <History className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-6 w-full" />
          <Skeleton className="mt-2 h-6 w-full" />
          <Skeleton className="mt-2 h-6 w-3/4" />
        </CardContent>
      </Card>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">
            {t('transactions.title')}
          </CardTitle>
          <History className="h-5 w-5 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t('transactions.empty')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const visible = expanded
    ? transactions
    : transactions.slice(0, INITIAL_VISIBLE);
  const hasMore = transactions.length > INITIAL_VISIBLE;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">
          {t('transactions.title')}
        </CardTitle>
        <History className="h-5 w-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {visible.map((txn) => (
            <TransactionRow key={txn.id} txn={txn} />
          ))}
        </div>
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <>
                <ChevronUp className="mr-1 h-4 w-4" />
                {t('transactions.showLess')}
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 h-4 w-4" />
                {t('transactions.showAll', {
                  count: transactions.length,
                })}
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
