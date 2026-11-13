import { ShoppingCart, DollarSign, CircleCheck, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/utils/format';
import type { DashboardStats } from '../api/dashboard.api';

interface StatsCardsProps {
  data?: DashboardStats;
  loading: boolean;
}

export function StatsCards({ data, loading }: StatsCardsProps) {
  const { t } = useTranslation('dashboard');

  const cards = [
    {
      title: t('statsCards.totalOrders'),
      value: data?.totalOrders ?? '—',
      subtitle: t('statsCards.allTime'),
      icon: ShoppingCart,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: t('statsCards.revenue'),
      value: data ? formatCurrency(data.totalRevenue) : '—',
      subtitle: t('statsCards.allTime'),
      icon: DollarSign,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: t('statsCards.completedOrders'),
      value: data?.completedOrders ?? '—',
      subtitle: t('statsCards.allTime'),
      icon: CircleCheck,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: t('statsCards.completionRate'),
      value: data ? `${data.completionRate}%` : '—',
      subtitle: t('statsCards.allTime'),
      icon: TrendingUp,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title} className="min-w-0">
          <CardContent className="p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {card.title}
              </p>
              <div className={`shrink-0 rounded-lg p-3 ${card.bgColor}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums tracking-tight [overflow-wrap:anywhere]">
              {card.value}
            </p>
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {card.subtitle}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
