import { useDaySummary } from '../hooks/useAnalytics';
import { useTranslation } from 'react-i18next';
import { displayMoney } from '@/shared/utils/money';
import { Card, CardHeader, CardTitle, CardContent } from '@/shared/ui/card';

export function DaySummary({
  branchId,
  date,
}: {
  branchId: string;
  date: string;
}) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const query = useDaySummary(branchId, date);
  if (query.isLoading) return <p role="status">{tc('status.loading')}</p>;
  if (query.isError)
    return (
      <p role="alert" className="text-destructive">
        {tc('errors.loadFailed')}
      </p>
    );
  if (!query.data) return null;
  const { sales, receipts, timezone } = query.data;
  return (
    <section aria-label={t('day.title')} className="space-y-3">
      <h2 className="font-semibold">
        {t('day.title')}{' '}
        <span className="text-sm font-normal text-muted-foreground">
          {date} · {timezone}
        </span>
      </h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('day.sales')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-2xl font-semibold">
              {displayMoney(sales.scheduledTotal)}
            </p>
            <p className="text-muted-foreground">{t('day.salesHint')}</p>
            <p>
              {t('day.orders', { count: sales.orderCount })} ·{' '}
              {t('day.completed', { count: sales.completedCount })}:{' '}
              {displayMoney(sales.completedTotal)}
            </p>
            {sales.byStatus.map((s) => (
              <div className="flex justify-between gap-3" key={s.status}>
                <span>
                  {t(`status.${s.status}`)} ({s.count})
                </span>
                <span>{displayMoney(s.total)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('day.receipts')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-2xl font-semibold">
              {displayMoney(receipts.total)}
            </p>
            <p className="text-muted-foreground">{t('day.receiptsHint')}</p>
            {receipts.byMethod.map((m) => (
              <div className="flex justify-between gap-3" key={m.method}>
                <span>
                  {t(`payment.method.${m.method}`)} ({m.count})
                </span>
                <span>{displayMoney(m.total)}</span>
              </div>
            ))}
            {!receipts.count && <p>{t('payment.empty')}</p>}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
