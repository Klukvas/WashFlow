import { useId } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/shared/ui/skeleton';
import type { RevenueData } from '../api/dashboard.api';

interface RevenueChartProps {
  data: RevenueData[];
  loading: boolean;
}

export default function RevenueChart({ data, loading }: RevenueChartProps) {
  const gradientId = useId();
  const { t } = useTranslation('dashboard');

  if (loading) {
    return <Skeleton className="h-64" />;
  }

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        {t('revenue.noData')}
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-primary)"
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor="var(--color-primary)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="var(--color-border)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="var(--color-muted-foreground)"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            color: 'var(--color-popover-foreground)',
          }}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--color-primary)"
          fillOpacity={1}
          fill={`url(#${gradientId})`}
          strokeWidth={2}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
