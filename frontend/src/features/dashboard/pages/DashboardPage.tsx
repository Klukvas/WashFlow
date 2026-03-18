import { Suspense, lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/shared/components/PageHeader';
import { Skeleton } from '@/shared/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import { StatsCards } from '../components/StatsCards';
import { KpiCards } from '../components/KpiCards';
import { LiveOperationsPanel } from '../components/LiveOperationsPanel';
import { BranchPerformanceTable } from '../components/BranchPerformanceTable';
import { EmployeePerformanceTable } from '../components/EmployeePerformanceTable';
import { AlertsPanel } from '../components/AlertsPanel';
import {
  useDashboardStats,
  useRevenueData,
  useKpiData,
  useLiveOperations,
  useBranchPerformance,
  useEmployeePerformance,
  useAlerts,
  useOnlineBookingStats,
} from '../hooks/useDashboard';

const RevenueChart = lazy(() => import('../components/RevenueChart'));
const OnlineBookingChart = lazy(
  () => import('../components/OnlineBookingChart'),
);

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { t: tNav } = useTranslation('nav');
  const { t: tc } = useTranslation('common');
  const { branchId } = useBranchScope();
  const branchParams = branchId ? { branchId } : undefined;

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useDashboardStats(branchParams);
  const {
    data: revenueData,
    isLoading: revenueLoading,
    isError: revenueError,
  } = useRevenueData(branchParams);
  const {
    data: kpiData,
    isLoading: kpiLoading,
    isError: kpiError,
  } = useKpiData(branchParams);
  const {
    data: liveData,
    isLoading: liveLoading,
    isError: liveError,
  } = useLiveOperations(branchParams);
  const {
    data: branchData,
    isLoading: branchLoading,
    isError: branchError,
  } = useBranchPerformance(branchParams);
  const {
    data: employeeData,
    isLoading: employeeLoading,
    isError: employeeError,
  } = useEmployeePerformance(branchParams);
  const {
    data: alertsData,
    isLoading: alertsLoading,
    isError: alertsError,
  } = useAlerts(branchParams);
  const {
    data: bookingData,
    isLoading: bookingLoading,
    isError: bookingError,
  } = useOnlineBookingStats(branchParams);

  const hasError =
    statsError ||
    revenueError ||
    kpiError ||
    liveError ||
    branchError ||
    employeeError ||
    alertsError ||
    bookingError;

  if (hasError) {
    return (
      <div>
        <PageHeader title={tNav('dashboard')} />
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{tc('errors.loadFailed')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={tNav('dashboard')} />

      <div className="space-y-6">
        {/* KPI cards — always visible */}
        <KpiCards data={kpiData} loading={kpiLoading} />

        {/* Legacy stat cards */}
        <StatsCards data={stats} loading={statsLoading} />

        {/* Live ops + Revenue */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <LiveOperationsPanel data={liveData} loading={liveLoading} />

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('revenue.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<Skeleton className="h-64" />}>
                <RevenueChart
                  data={revenueData ?? []}
                  loading={revenueLoading}
                />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        {/* Branch performance — hidden for branch-scoped users */}
        <BranchPerformanceTable data={branchData} loading={branchLoading} />

        {/* Employee performance */}
        <EmployeePerformanceTable
          data={employeeData}
          loading={employeeLoading}
        />

        {/* Alerts + Online booking */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <AlertsPanel data={alertsData} loading={alertsLoading} />

          <Suspense fallback={<Skeleton className="h-64" />}>
            <OnlineBookingChart data={bookingData} loading={bookingLoading} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
