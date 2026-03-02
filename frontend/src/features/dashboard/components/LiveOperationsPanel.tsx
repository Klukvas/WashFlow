import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import type { LiveOperations } from '../api/dashboard.api';

interface LiveOperationsPanelProps {
  data?: LiveOperations;
  loading: boolean;
}

interface StatCellProps {
  label: string;
  value: number;
  variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline';
}

function StatCell({ label, value, variant }: StatCellProps) {
  return (
    <div className="flex flex-col items-center gap-2 p-4 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
      <Badge variant={variant} className="px-3 py-1 text-xl font-bold">
        {value}
      </Badge>
    </div>
  );
}

export function LiveOperationsPanel({ data, loading }: LiveOperationsPanelProps) {
  const { t } = useTranslation('dashboard');

  if (loading) {
    return <Skeleton className="h-40" />;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="border-b border-border px-4 py-3 text-sm font-semibold">
          {t('live.title')}
        </h3>
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-4 sm:divide-y-0">
          <StatCell
            label={t('live.inProgress')}
            value={data?.inProgressCount ?? 0}
            variant="default"
          />
          <StatCell
            label={t('live.waiting')}
            value={data?.waitingCount ?? 0}
            variant="warning"
          />
          <StatCell
            label={t('live.freeWorkPosts')}
            value={data?.freeWorkPosts ?? 0}
            variant="success"
          />
          <StatCell
            label={t('live.overdue')}
            value={data?.overdueOrders ?? 0}
            variant={data?.overdueOrders ? 'destructive' : 'secondary'}
          />
        </div>
      </CardContent>
    </Card>
  );
}
