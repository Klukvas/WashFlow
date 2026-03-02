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
const OnlineBookingChart = lazy(() => import('../components/OnlineBookingChart'));

export function DashboardPage() {
  const { t } = useTranslation('dashboard');
  const { t: tNav } = useTranslation('nav');
  const { branchId } = useBranchScope();
  const branchParams = branchId ? { branchId } : undefined;

  const { data: stats, isLoading: statsLoading } = useDashboardStats(branchParams);
  const { data: revenueData, isLoading: revenueLoading } = useRevenueData(branchParams);
  const { data: kpiData, isLoading: kpiLoading } = useKpiData(branchParams);
  const { data: liveData, isLoading: liveLoading } = useLiveOperations(branchParams);
  const { data: branchData, isLoading: branchLoading } = useBranchPerformance(branchParams);
  const { data: employeeData, isLoading: employeeLoading } = useEmployeePerformance(branchParams);
  const { data: alertsData, isLoading: alertsLoading } = useAlerts(branchParams);
  const { data: bookingData, isLoading: bookingLoading } = useOnlineBookingStats(branchParams);

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
                <RevenueChart data={revenueData ?? []} loading={revenueLoading} />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        {/* Branch performance — hidden for branch-scoped users */}
        <BranchPerformanceTable data={branchData} loading={branchLoading} />

        {/* Employee performance */}
        <EmployeePerformanceTable data={employeeData} loading={employeeLoading} />

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
