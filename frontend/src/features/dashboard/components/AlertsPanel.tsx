import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';
import type { DashboardAlert } from '../api/dashboard.api';

interface AlertsPanelProps {
  data?: DashboardAlert[];
  loading: boolean;
}

const SEVERITY_BORDER: Record<DashboardAlert['severity'], string> = {
  LOW: 'border-l-warning',
  MEDIUM: 'border-l-warning',
  HIGH: 'border-l-destructive',
  CRITICAL: 'border-l-destructive bg-destructive/5',
};

const SEVERITY_BADGE: Record<
  DashboardAlert['severity'],
  'warning' | 'destructive'
> = {
  LOW: 'warning',
  MEDIUM: 'warning',
  HIGH: 'destructive',
  CRITICAL: 'destructive',
};

export function AlertsPanel({ data, loading }: AlertsPanelProps) {
  const { t } = useTranslation('dashboard');

  if (loading) {
    return <Skeleton className="h-40" />;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-4 text-sm font-semibold">{t('alerts.title')}</h3>

        {!data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('alerts.noAlerts')}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map((alert) => (
              <li
                key={`${alert.type}-${alert.severity}-${alert.messageKey}`}
                className={`flex items-start justify-between gap-3 rounded-r-lg border-l-4 px-3 py-2 ${SEVERITY_BORDER[alert.severity]}`}
              >
                <p className="text-sm">
                  {t(alert.messageKey, alert.payload as Record<string, string>)}
                </p>
                <Badge
                  variant={SEVERITY_BADGE[alert.severity]}
                  className="shrink-0"
                >
                  {t(`alerts.severity.${alert.severity}`)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
