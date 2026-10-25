import { useTranslation } from 'react-i18next';
import type { Order } from '@/shared/types/models';
import { usePermissions } from '@/shared/hooks/usePermissions';
import { moneyCents, decimalMoney, displayMoney } from '@/shared/utils/money';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/ui/card';
import { usePayments } from '../hooks/usePayments';
import { PaymentsList } from './PaymentsList';
import { PaymentForm } from './PaymentForm';

export function OrderPayments({ order }: { order: Order }) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const { hasPermission } = usePermissions();
  const query = usePayments(order.id);
  const payments = query.data ?? [];
  const paid = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum + moneyCents(p.amount), 0n);
  const recorded = payments.reduce((sum, p) => sum + moneyCents(p.amount), 0n);
  const total = moneyCents(order.totalPrice);
  const remaining = total > paid ? total - paid : 0n;
  const capacity = total > recorded ? total - recorded : 0n;
  const terminal = ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(order.status);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('payment.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading ? (
          <p role="status">{tc('status.loading')}</p>
        ) : query.isError ? (
          <p role="alert" className="text-destructive">
            {tc('errors.loadFailed')}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 rounded-md bg-muted/50 p-3 text-sm">
              <div>
                {t('payment.received')}
                <strong className="block text-lg">
                  {displayMoney(decimalMoney(paid))}
                </strong>
              </div>
              <div>
                {t('payment.remaining')}
                <strong className="block text-lg">
                  {displayMoney(decimalMoney(remaining))}
                </strong>
              </div>
            </div>
            <p className="text-sm font-medium">
              {t(
                paid >= total
                  ? 'payment.paid'
                  : paid > 0n
                    ? 'payment.partial'
                    : 'payment.unpaid',
              )}
            </p>
            {recorded > paid && (
              <p className="text-sm text-muted-foreground">
                {t('payment.reservedHint', {
                  amount: displayMoney(decimalMoney(recorded - paid)),
                })}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {t(terminal ? 'payment.closed' : 'payment.beforeCompletion')}
            </p>
            {!terminal && capacity > 0n && hasPermission('payments.create') && (
              <PaymentForm
                orderId={order.id}
                maxAmount={decimalMoney(capacity)}
                disabled={query.isFetching}
              />
            )}
            <h3 className="text-sm font-semibold">{t('payment.history')}</h3>
            <PaymentsList orderId={order.id} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
