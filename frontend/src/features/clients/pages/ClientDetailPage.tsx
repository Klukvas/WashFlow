import { useState } from 'react';
import { useParams, useNavigate, NavLink } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2, RotateCcw, Edit, Merge } from 'lucide-react';
import {
  useClient,
  useUpdateClient,
  useDeleteClient,
  useRestoreClient,
} from '../hooks/useClients';
import { ClientForm, type ClientFormValues } from '../components/ClientForm';
import { MergeClientsDialog } from '../components/MergeClientsDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { formatDate } from '@/shared/utils/format';
import type { Vehicle } from '@/shared/types/models';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('common');
  const { data: client, isLoading } = useClient(id!);
  const { mutate: updateClientMut, isPending: updating } = useUpdateClient();
  const { mutate: deleteClientMut, isPending: deleting } = useDeleteClient();
  const { mutate: restoreClientMut, isPending: restoring } = useRestoreClient();

  const { t: tc } = useTranslation('clients');

  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);

  const handleUpdate = (values: ClientFormValues) => {
    updateClientMut(
      { id: id!, ...values },
      {
        onSuccess: () => setIsEditing(false),
      },
    );
  };

  const handleDelete = () => {
    deleteClientMut(id!, {
      onSuccess: () => navigate('/clients'),
    });
  };

  const handleRestore = () => {
    restoreClientMut(id!);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {t('errors.notFound')}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`${client.firstName} ${client.lastName}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/clients')}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {t('actions.back')}
            </Button>
            {client.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.CLIENTS.UPDATE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestore}
                  loading={restoring}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {t('actions.restore')}
                </Button>
              </PermissionGate>
            ) : (
              <>
                <PermissionGate permission={PERMISSIONS.CLIENTS.UPDATE}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMergeOpen(true)}
                  >
                    <Merge className="mr-1 h-4 w-4" />
                    {tc('merge.mergeWith')}
                  </Button>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.CLIENTS.UPDATE}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing((prev) => !prev)}
                  >
                    <Edit className="mr-1 h-4 w-4" />
                    {isEditing ? t('actions.cancel') : t('actions.edit')}
                  </Button>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.CLIENTS.DELETE}>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {t('actions.delete')}
                  </Button>
                </PermissionGate>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Client Info / Edit Form */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t('fields.details')}</CardTitle>
                <SoftDeleteBadge deletedAt={client.deletedAt} />
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <ClientForm
                  client={client}
                  onSubmit={handleUpdate}
                  onCancel={() => setIsEditing(false)}
                  loading={updating}
                />
              ) : (
                <div className="space-y-3">
                  <DetailRow
                    label={t('fields.firstName')}
                    value={client.firstName}
                  />
                  <DetailRow
                    label={t('fields.lastName')}
                    value={client.lastName ?? ''}
                  />
                  <DetailRow
                    label={t('fields.phone')}
                    value={client.phone ?? ''}
                  />
                  <DetailRow
                    label={t('fields.email')}
                    value={client.email ?? '—'}
                  />
                  <DetailRow
                    label={t('fields.notes')}
                    value={client.notes ?? '—'}
                  />
                  <DetailRow
                    label={t('fields.createdAt')}
                    value={formatDate(client.createdAt)}
                  />
                  <DetailRow
                    label={t('fields.updatedAt')}
                    value={formatDate(client.updatedAt)}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vehicles List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t('fields.vehicles')} ({client.vehicles?.length ?? 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {client.vehicles && client.vehicles.length > 0 ? (
                <div className="space-y-3">
                  {client.vehicles.map((vehicle: Vehicle) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('status.noResults')}
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('fields.quickInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.name')}
                </span>
                <span className="font-medium">
                  {client.firstName} {client.lastName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.phone')}
                </span>
                <span className="font-medium">{client.phone}</span>
              </div>
              {client.email && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {t('fields.email')}
                  </span>
                  <span className="font-medium">{client.email}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.vehicles')}
                </span>
                <span className="font-medium">
                  {client.vehicles?.length ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.createdAt')}
                </span>
                <span className="font-medium">
                  {formatDate(client.createdAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {t('actions.quickActions')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <PermissionGate permission={PERMISSIONS.CLIENTS.READ}>
                <NavLink
                  to={`/orders?clientId=${client.id}`}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {t('actions.viewOrders')}
                </NavLink>
              </PermissionGate>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={t('actions.delete')}
        message={t('softDelete.confirmDelete')}
        variant="destructive"
        loading={deleting}
      />

      <MergeClientsDialog
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        targetClient={client}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3">
      <div>
        <p className="font-medium">{vehicle.licensePlate}</p>
        {(vehicle.make || vehicle.model) && (
          <p className="text-sm text-muted-foreground">
            {[vehicle.make, vehicle.model, vehicle.year && `(${vehicle.year})`]
              .filter(Boolean)
              .join(' ')}
          </p>
        )}
      </div>
      {vehicle.color && (
        <span className="text-sm text-muted-foreground">{vehicle.color}</span>
      )}
    </div>
  );
}
