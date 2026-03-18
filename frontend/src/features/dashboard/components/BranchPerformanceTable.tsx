import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/ui/card';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { formatCurrency } from '@/shared/utils/format';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import type { BranchPerformance } from '../api/dashboard.api';

interface BranchPerformanceTableProps {
  data?: BranchPerformance[];
  loading: boolean;
}

export function BranchPerformanceTable({
  data,
  loading,
}: BranchPerformanceTableProps) {
  const { t } = useTranslation('dashboard');
  const { isBranchScoped } = useBranchScope();

  const columns = useMemo<Column<BranchPerformance>[]>(
    () => [
      {
        key: 'name',
        header: t('branches.name'),
        render: (row) => <span className="font-medium">{row.name}</span>,
      },
      {
        key: 'revenue',
        header: t('branches.revenue'),
        render: (row) => formatCurrency(row.revenue),
        className: 'hidden sm:table-cell',
      },
      {
        key: 'orders',
        header: t('branches.orders'),
        render: (row) => row.orders,
      },
      {
        key: 'avgCheck',
        header: t('branches.avgCheck'),
        render: (row) => formatCurrency(row.avgCheck),
        className: 'hidden sm:table-cell',
      },
      {
        key: 'loadRate',
        header: t('branches.loadRate'),
        render: (row) => `${row.loadRate.toFixed(0)}%`,
      },
    ],
    [t],
  );

  if (isBranchScoped) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-4 text-sm font-semibold">{t('branches.title')}</h3>
        <DataTable columns={columns} data={data ?? []} loading={loading} />
      </CardContent>
    </Card>
  );
}
