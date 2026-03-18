import { Suspense, lazy, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAnalyticsDashboard,
  useAnalyticsRevenue,
  useAnalyticsServices,
} from '../hooks/useAnalytics';
import { useBranches } from '@/features/branches/hooks/useBranches';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { DatePicker } from '@/shared/ui/date-picker';
import { Select } from '@/shared/ui/select';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency } from '@/shared/utils/format';
import { useBranchScope } from '@/shared/hooks/useBranchScope';

const RevenueChart = lazy(
  () => import('../../dashboard/components/RevenueChart'),
);
const PopularServicesChart = lazy(
  () => import('../components/PopularServicesChart'),
);

export function AnalyticsPage() {
  const { t } = useTranslation('analytics');
  const { t: tn } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const { branchId: userBranchId, isBranchScoped } = useBranchScope();
  const [branchId, setBranchId] = useState<string | undefined>(
    userBranchId ?? undefined,
  );
  const [dateFrom, setDateFrom] = useState<string>();
  const [dateTo, setDateTo] = useState<string>();

  const params = useMemo(
    () => ({ branchId, dateFrom, dateTo }),
    [branchId, dateFrom, dateTo],
  );
  const {
    data: dashboard,
    isLoading: dashLoading,
    isError: dashError,
  } = useAnalyticsDashboard(params);
  const {
    data: revenue,
    isLoading: revLoading,
    isError: revError,
  } = useAnalyticsRevenue(params);
  const {
    data: services,
    isLoading: svcLoading,
    isError: svcError,
  } = useAnalyticsServices(params);

  const hasError = dashError || revError || svcError;

  const { data: branchesData } = useBranches({ limit: 100 });
  const branches = branchesData?.items ?? [];

  return (
    <div>
      <PageHeader title={tn('analytics')} />

      <div className="mb-6 flex flex-wrap gap-3">
        {!isBranchScoped && (
          <Select
            options={[
              { value: '', label: t('allBranches') },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
            value={branchId ?? ''}
            onChange={(e) => setBranchId(e.target.value || undefined)}
            className="w-full sm:w-48"
          />
        )}
        <DatePicker
          value={dateFrom ?? ''}
          onChange={(v) => setDateFrom(v || undefined)}
          placeholder={t('dateFrom')}
          clearable
          className="w-full sm:w-40"
        />
        <DatePicker
          value={dateTo ?? ''}
          onChange={(v) => setDateTo(v || undefined)}
          placeholder={t('dateTo')}
          clearable
          className="w-full sm:w-40"
        />
      </div>

      {hasError && (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{tc('errors.loadFailed')}</p>
        </div>
      )}

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {dashLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {t('totalRevenue')}
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(dashboard?.revenue ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {t('totalOrders')}
                </p>
                <p className="text-2xl font-bold">
                  {dashboard?.totalOrders ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {t('activeClients')}
                </p>
                <p className="text-2xl font-bold">
                  {dashboard?.activeClients ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  {t('completionRate')}
                </p>
                <p className="text-2xl font-bold">
                  {dashboard?.completionRate ?? 0}%
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('revenueOverTime')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-64" />}>
              <RevenueChart data={revenue ?? []} loading={revLoading} />
            </Suspense>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('popularServices')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<Skeleton className="h-64" />}>
              <PopularServicesChart
                data={services ?? []}
                loading={svcLoading}
              />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
