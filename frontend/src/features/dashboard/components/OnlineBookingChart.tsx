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
import { Card, CardContent } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import type { OnlineBookingStats } from '../api/dashboard.api';

interface OnlineBookingChartProps {
  data?: OnlineBookingStats;
  loading: boolean;
}

export default function OnlineBookingChart({
  data,
  loading,
}: OnlineBookingChartProps) {
  const { t } = useTranslation('dashboard');

  if (loading) {
    return <Skeleton className="h-64" />;
  }

  const chartData = (data?.bySource ?? []).map((s) => ({
    name: t(`onlineBooking.sources.${s.source}`, { defaultValue: s.source }),
    count: s.count,
  }));

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-1 text-sm font-semibold">
          {t('onlineBooking.title')}
        </h3>

        <div className="mb-4 flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground">
              {t('onlineBooking.total')}:{' '}
            </span>
            <span className="font-semibold">{data?.total ?? 0}</span>
          </div>
          <div>
            <span className="text-muted-foreground">
              {t('onlineBooking.onlineRate')}:{' '}
            </span>
            <span className="font-semibold">
              {(data?.onlineRate ?? 0).toFixed(1)}%
            </span>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            {t('onlineBooking.noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} layout="vertical">
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
                width={80}
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
        )}
      </CardContent>
    </Card>
  );
}
