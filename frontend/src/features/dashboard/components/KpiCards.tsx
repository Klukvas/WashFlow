import {
  DollarSign,
  ShoppingCart,
  Clock,
  XCircle,
  Users,
  Activity,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/utils/format';
import type { KpiData } from '../api/dashboard.api';

interface KpiCardsProps {
  data?: KpiData;
  loading: boolean;
}

export function KpiCards({ data, loading }: KpiCardsProps) {
  const { t } = useTranslation('dashboard');

  const cards = [
    {
      title: t('kpi.revenueToday'),
      value: formatCurrency(data?.revenueToday ?? 0),
      icon: DollarSign,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: t('kpi.ordersToday'),
      value: data?.ordersToday ?? 0,
      icon: ShoppingCart,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: t('kpi.avgOrderDuration'),
      value: `${data?.avgOrderDuration ?? 0} ${t('kpi.avgOrderDurationUnit')}`,
      icon: Clock,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: t('kpi.cancelRateToday'),
      value: `${((data?.cancelRateToday ?? 0) * 100).toFixed(1)}%`,
      icon: XCircle,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
    },
    {
      title: t('kpi.activeClientsToday'),
      value: data?.activeClientsToday ?? 0,
      icon: Users,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: t('kpi.occupancyRate'),
      value: `${(data?.occupancyRate ?? 0).toFixed(1)}%`,
      icon: Activity,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {card.title}
                </p>
                <p className="mt-1 text-lg font-bold leading-tight tracking-tight">
                  {card.value}
                </p>
              </div>
              <div className={`shrink-0 rounded-lg p-2 ${card.bgColor}`}>
                <card.icon className={`h-4 w-4 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
