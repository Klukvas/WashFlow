import { ShoppingCart, DollarSign, Users, TrendingUp } from 'lucide-react';
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/utils/format';
import type { DashboardStats } from '../api/dashboard.api';

interface StatsCardsProps {
  data?: DashboardStats;
  loading: boolean;
}

export function StatsCards({ data, loading }: StatsCardsProps) {
  const cards = [
    {
      title: 'Total Orders',
      value: data?.totalOrders ?? 0,
      subtitle: `${data?.todayOrders ?? 0} today`,
      icon: ShoppingCart,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Revenue',
      value: formatCurrency(data?.revenue ?? 0),
      subtitle: `${formatCurrency(data?.todayRevenue ?? 0)} today`,
      icon: DollarSign,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Active Clients',
      value: data?.activeClients ?? 0,
      subtitle: 'All time',
      icon: Users,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    },
    {
      title: 'Completion Rate',
      value: `${data?.completionRate ?? 0}%`,
      subtitle: 'This period',
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
                <p className="mt-1 text-xs text-muted-foreground">{card.subtitle}</p>
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
