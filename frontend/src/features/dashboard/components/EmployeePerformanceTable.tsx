import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/shared/ui/card';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { formatCurrency } from '@/shared/utils/format';
import { PERMISSIONS } from '@/shared/constants/permissions';
import type { EmployeePerformance } from '../api/dashboard.api';

interface EmployeePerformanceTableProps {
  data?: EmployeePerformance[];
  loading: boolean;
}

export function EmployeePerformanceTable({ data, loading }: EmployeePerformanceTableProps) {
  const { t } = useTranslation('dashboard');

  const columns: Column<EmployeePerformance>[] = [
    {
      key: 'name',
      header: t('employees.name'),
      render: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'branch',
      header: t('employees.branch'),
      render: (row) => row.branch,
      className: 'hidden sm:table-cell',
    },
    {
      key: 'orders',
      header: t('employees.orders'),
      render: (row) => row.orders,
    },
    {
      key: 'revenue',
      header: t('employees.revenue'),
      render: (row) => formatCurrency(row.revenue),
      className: 'hidden sm:table-cell',
    },
    {
      key: 'cancelRate',
      header: t('employees.cancelRate'),
      render: (row) => `${(row.cancelRate * 100).toFixed(1)}%`,
    },
  ];

  return (
    <PermissionGate permission={PERMISSIONS.ANALYTICS.VIEW}>
      <Card>
        <CardContent className="p-4">
          <h3 className="mb-4 text-sm font-semibold">{t('employees.title')}</h3>
          <DataTable
            columns={columns}
            data={data ?? []}
            loading={loading}
          />
        </CardContent>
      </Card>
    </PermissionGate>
  );
}
