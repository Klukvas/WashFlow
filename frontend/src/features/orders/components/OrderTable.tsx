import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { StatusBadge } from './StatusBadge';
import { formatDateTime, formatCurrency } from '@/shared/utils/format';
import type { Order } from '@/shared/types/models';

interface OrderTableProps {
  orders: Order[];
  loading: boolean;
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  onRowClick: (order: Order) => void;
}

export function OrderTable({
  orders,
  loading,
  page,
  totalPages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  onRowClick,
}: OrderTableProps) {
  const { t } = useTranslation('orders');

  const columns: Column<Order>[] = useMemo(
    () => [
      {
        key: 'client',
        header: t('fields.client'),
        render: (order) =>
          order.client
            ? [order.client.firstName, order.client.lastName]
                .filter(Boolean)
                .join(' ')
            : '—',
      },
      {
        key: 'vehicle',
        header: t('fields.vehicle'),
        render: (order) => order.vehicle?.licensePlate ?? '—',
        className: 'hidden md:table-cell',
      },
      {
        key: 'scheduledStart',
        header: t('fields.scheduledStart'),
        render: (order) => formatDateTime(order.scheduledStart),
      },
      {
        key: 'status',
        header: t('fields.status'),
        render: (order) => (
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <SoftDeleteBadge deletedAt={order.deletedAt} />
          </div>
        ),
      },
      {
        key: 'totalPrice',
        header: t('fields.totalPrice'),
        render: (order) => formatCurrency(order.totalPrice),
        className: 'hidden sm:table-cell',
      },
      {
        key: 'branch',
        header: t('fields.branch'),
        render: (order) => order.branch?.name ?? '—',
        className: 'hidden lg:table-cell',
      },
    ],
    [t],
  );

  return (
    <DataTable
      columns={columns}
      data={orders}
      loading={loading}
      page={page}
      totalPages={totalPages}
      total={total}
      limit={limit}
      onPageChange={onPageChange}
      onLimitChange={onLimitChange}
      onRowClick={onRowClick}
    />
  );
}
