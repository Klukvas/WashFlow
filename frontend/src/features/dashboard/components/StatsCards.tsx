import { ShoppingCart, DollarSign, Users, TrendingUp } from 'lucide-react';
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
      value: data?.totalOrders ?? 0,
      subtitle: t('statsCards.todayOrders', { count: data?.todayOrders ?? 0 }),
      icon: ShoppingCart,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: t('statsCards.revenue'),
      value: formatCurrency(data?.revenue ?? 0),
      subtitle: t('statsCards.todayRevenue', {
        value: formatCurrency(data?.todayRevenue ?? 0),
      }),
      icon: DollarSign,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: t('statsCards.activeClients'),
      value: data?.activeClients ?? 0,
      subtitle: t('statsCards.allTime'),
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: t('statsCards.completionRate'),
      value: `${data?.completionRate ?? 0}%`,
      subtitle: t('statsCards.thisPeriod'),
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
        <Card key={card.title}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{card.title}</p>
                <p className="mt-1 text-2xl font-bold">{card.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.subtitle}
                </p>
              </div>
              <div className={`rounded-lg p-3 ${card.bgColor}`}>
                <card.icon className={`h-6 w-6 ${card.color}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
