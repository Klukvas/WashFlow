import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  LayoutGrid,
  List,
  CalendarDays,
  ClipboardList,
} from 'lucide-react';
import { useOrders } from '../hooks/useOrders';
import { OrderTable } from '../components/OrderTable';
import { OrderCard } from '../components/OrderCard';
import { OrderFilters } from '../components/OrderFilters';
import { ScheduleView } from '../components/ScheduleView';
import { PageHeader } from '@/shared/components/PageHeader';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { Button } from '@/shared/ui/button';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useBranchScope } from '@/shared/hooks/useBranchScope';
import type { OrderQueryParams } from '../api/orders.api';
import { useBranches } from '@/features/branches/hooks/useBranches';
import type { Order } from '@/shared/types/models';
import { cn } from '@/shared/utils/cn';

type ActiveTab = 'orders' | 'schedule';

export function OrdersPage() {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const { branchId: userBranchId, isBranchScoped } = useBranchScope();
  const [activeTab, setActiveTab] = useState<ActiveTab>('orders');
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [filters, setFilters] = useState<OrderQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    ...(userBranchId ? { branchId: userBranchId } : {}),
  });

  const { data, isLoading, isError } = useOrders(filters);
  const { data: branchesData } = useBranches({ limit: 100 });
  const branches = branchesData?.items ?? [];

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
            {activeTab === 'orders' && (
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
            )}
            <PermissionGate permission={PERMISSIONS.ORDERS.CREATE}>
              <Button onClick={() => navigate('/orders/create')}>
                <Plus className="h-4 w-4" />
                {t('createOrder')}
              </Button>
            </PermissionGate>
          </div>
        }
      />

      {/* Tab bar */}
      <div
        role="tablist"
        className="mb-4 flex items-center gap-1 border-b border-border"
      >
        <button
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'orders'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('orders')}
        >
          <ClipboardList className="h-4 w-4" />
          {t('tabs.orders')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'schedule'}
          className={cn(
            'flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'schedule'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('schedule')}
        >
          <CalendarDays className="h-4 w-4" />
          {t('tabs.schedule')}
        </button>
      </div>

      {activeTab === 'orders' && isError && (
        <div role="tabpanel" className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{tc('errors.loadFailed')}</p>
        </div>
      )}

      {activeTab === 'orders' && !isError && (
        <div role="tabpanel">
          <div className="mb-4">
            <OrderFilters
              filters={filters}
              branches={branches}
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
      )}

      {activeTab === 'schedule' && (
        <div role="tabpanel">
          <ScheduleView />
        </div>
      )}
    </div>
  );
}
