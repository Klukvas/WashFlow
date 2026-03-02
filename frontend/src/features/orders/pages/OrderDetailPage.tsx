import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useOrder, useDeleteOrder, useRestoreOrder } from '../hooks/useOrders';
import { StatusBadge } from '../components/StatusBadge';
import { StatusTransition } from '../components/StatusTransition';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatDateTime, formatCurrency, formatDuration } from '@/shared/utils/format';
import { PERMISSIONS } from '@/shared/constants/permissions';

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const { data: order, isLoading } = useOrder(id!);
  const { mutate: deleteOrderMut, isPending: deleting } = useDeleteOrder();
  const { mutate: restoreOrderMut, isPending: restoring } = useRestoreOrder();
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!order) {
    return <div className="py-12 text-center text-muted-foreground">{tc('errors.notFound')}</div>;
  }

  return (
    <div>
      <PageHeader
        title={t('orderDetail')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => navigate('/orders')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('actions.back')}
            </Button>
            {order.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.ORDERS.UPDATE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreOrderMut(order.id)}
                  loading={restoring}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {tc('actions.restore')}
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate permission={PERMISSIONS.ORDERS.DELETE}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {tc('actions.delete')}
                </Button>
              </PermissionGate>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t('fields.status')}</CardTitle>
                <div className="flex items-center gap-2">
                  <StatusBadge status={order.status} />
                  <SoftDeleteBadge deletedAt={order.deletedAt} />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <StatusTransition orderId={order.id} currentStatus={order.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('fields.services')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.services?.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3"
                  >
                    <div>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatDuration(s.durationMin)}
                      </p>
                    </div>
                    <span className="font-semibold">{formatCurrency(s.price)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-border pt-3 font-semibold">
                  <span>{t('fields.totalPrice')}</span>
                  <span>{formatCurrency(order.totalPrice)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('fields.client')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.client && (
                <>
                  <p className="font-medium">
                    {order.client.firstName} {order.client.lastName}
                  </p>
                  <p className="text-muted-foreground">{order.client.phone}</p>
                  {order.client.email && (
                    <p className="text-muted-foreground">{order.client.email}</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('fields.vehicle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {order.vehicle && (
                <>
                  <p className="font-medium">{order.vehicle.licensePlate}</p>
                  {order.vehicle.make && (
                    <p className="text-muted-foreground">
                      {order.vehicle.make} {order.vehicle.model}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Schedule</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fields.scheduledStart')}</span>
                <span className="font-medium">{formatDateTime(order.scheduledStart)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fields.scheduledEnd')}</span>
                <span className="font-medium">{formatDateTime(order.scheduledEnd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fields.branch')}</span>
                <span className="font-medium">{order.branch?.name ?? '—'}</span>
              </div>
              {order.workPost && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('fields.workPost')}</span>
                  <span className="font-medium">{order.workPost.name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('fields.source')}</span>
                <span className="font-medium">{t(`source.${order.source}`)}</span>
              </div>
            </CardContent>
          </Card>

          {order.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('fields.notes')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => {
          deleteOrderMut(order.id, {
            onSuccess: () => navigate('/orders'),
          });
        }}
        title={tc('actions.delete')}
        message={tc('softDelete.confirmDelete')}
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
