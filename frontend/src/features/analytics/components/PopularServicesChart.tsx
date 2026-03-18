import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/shared/ui/skeleton';
import type { ServiceStat } from '../api/analytics.api';

interface PopularServicesChartProps {
  data: ServiceStat[];
  loading: boolean;
}

export default function PopularServicesChart({
  data,
  loading,
}: PopularServicesChartProps) {
  const { t } = useTranslation('analytics');

  if (loading) return <Skeleton className="h-64" />;

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('noData')}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          horizontal={false}
        />
        <XAxis
          type="number"
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-popover-foreground)',
          }}
        />
        <Bar
          dataKey="count"
          fill="var(--color-primary)"
          radius={[0, 4, 4, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
