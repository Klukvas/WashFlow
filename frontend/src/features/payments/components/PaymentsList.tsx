import { useTranslation } from 'react-i18next';
import { displayMoney } from '@/shared/utils/money';
import { usePayments } from '../hooks/usePayments';
import { formatDateTime } from '@/shared/utils/format';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';

interface PaymentsListProps {
  orderId: string;
}

export function PaymentsList({ orderId }: PaymentsListProps) {
  const { t } = useTranslation('orders');
  const { data: payments, isLoading, isError } = usePayments(orderId);

  if (isLoading) return <Skeleton className="h-24" />;

  if (isError) return <p role="alert">{t('payment.loadFailed')}</p>;

  if (!payments || payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">{t('payment.empty')}</p>
    );
  }

  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <div
          key={p.id}
          className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3"
        >
          <div>
            <p className="font-medium">{displayMoney(p.amount)}</p>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(p.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{t(`payment.method.${p.method}`)}</Badge>
            <Badge variant={p.status === 'PAID' ? 'success' : 'outline'}>
              {t(`payment.status.${p.status}`)}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
