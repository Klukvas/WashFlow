import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, LayoutGrid, List } from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { OrderTable } from '../components/OrderTable';
import { OrderCard } from '../components/OrderCard';
import { OrderFilters } from '../components/OrderFilters';
import { PageHeader } from '@/shared/components/PageHeader';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { Button } from '@/shared/ui/button';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import type { OrderQueryParams } from '../api/orders.api';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type { Branch, Order } from '@/shared/types/models';

export function OrdersPage() {
  const { t } = useTranslation('orders');
  const navigate = useNavigate();
  const { branchId: userBranchId, isBranchScoped } = useBranchScope();
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [filters, setFilters] = useState<OrderQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(userBranchId ? { branchId: userBranchId } : {}),
  });

  const { data, isLoading } = useOrders(filters);
  const { data: branchesData } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Branch>>(
        '/branches',
        {
          params: { limit: 100 },
        },
      );
      return data.data;
    },
    staleTime: Infinity,
  });

  const handleFilterChange = (newFilters: Partial<OrderQueryParams>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  };

  const handleReset = () => {
    setFilters({ page: 1, limit: 20, sortBy: 'createdAt', sortOrder: 'desc' });
  };

  const handleRowClick = (order: Order) => {
    navigate(`/orders/${order.id}`);
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden items-center rounded-md border border-border sm:flex">
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('table')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                size="icon"
                onClick={() => setViewMode('card')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <PermissionGate permission={PERMISSIONS.ORDERS.CREATE}>
              <Button onClick={() => navigate('/orders/create')}>
                <Plus className="h-4 w-4" />
                {t('createOrder')}
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <div className="mb-4">
        <OrderFilters
          filters={filters}
          branches={branchesData ?? []}
          onChange={handleFilterChange}
          onReset={handleReset}
          hideBranchFilter={isBranchScoped}
        />
      </div>

      {viewMode === 'table' ? (
        <OrderTable
          orders={data?.items ?? []}
          loading={isLoading}
          page={filters.page ?? 1}
          totalPages={data?.meta.totalPages ?? 1}
          total={data?.meta.total ?? 0}
          limit={filters.limit ?? 20}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          onLimitChange={(limit) =>
            setFilters((prev) => ({ ...prev, limit, page: 1 }))
          }
          onRowClick={handleRowClick}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.items.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onClick={() => handleRowClick(order)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
