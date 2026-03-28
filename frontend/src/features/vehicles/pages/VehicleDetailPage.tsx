import { useState } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Edit, Trash2, RotateCcw, Car, User } from 'lucide-react';
import {
  useVehicle,
  useUpdateVehicle,
  useDeleteVehicle,
  useRestoreVehicle,
} from '../hooks/useVehicles';
import { PageHeader } from '@/shared/components/PageHeader';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Skeleton } from '@/shared/ui/skeleton';
import { DialogFooter } from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { formatDate } from '@/shared/utils/format';

const editSchema = z.object({
  make: z.string().min(1, 'required'),
  model: z.string().optional().or(z.literal('')),
  licensePlate: z.string().optional().or(z.literal('')),
  color: z.string().optional().or(z.literal('')),
  year: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
    z.number().int().min(1900).max(2100).optional(),
  ),
});

type EditFormData = z.infer<typeof editSchema>;

export function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('vehicles');
  const { t: tc } = useTranslation('common');

  const { data: vehicle, isLoading } = useVehicle(id ?? '');
  const { mutate: update, isPending: updating } = useUpdateVehicle();
  const { mutate: deleteMut, isPending: deleting } = useDeleteVehicle();
  const { mutate: restore, isPending: restoring } = useRestoreVehicle();

  const [isEditing, setIsEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EditFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @hookform/resolvers v5 Resolver type targets RHF v8; project uses RHF v7
    resolver: zodResolver(editSchema) as any,
  });

  if (!id) return <Navigate to="/vehicles" replace />;

  function startEdit() {
    if (!vehicle) return;
    reset({
      make: vehicle.make,
      model: vehicle.model ?? '',
      licensePlate: vehicle.licensePlate ?? '',
      color: vehicle.color ?? '',
      year: vehicle.year ?? undefined,
    });
    setIsEditing(true);
  }

  function cancelEdit() {
    setIsEditing(false);
    reset();
  }

  function onSubmit(data: EditFormData) {
    update(
      {
        id: id!,
        make: data.make,
        model: data.model || undefined,
        licensePlate: data.licensePlate || undefined,
        color: data.color || undefined,
        year: data.year,
      },
      { onSuccess: () => setIsEditing(false) },
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {tc('errors.notFound')}
      </div>
    );
  }

  const displayName = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
  const clientName = vehicle.client
    ? [vehicle.client.firstName, vehicle.client.lastName]
        .filter(Boolean)
        .join(' ')
    : null;

  return (
    <div>
      <PageHeader
        title={displayName}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/vehicles')}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('actions.back')}
            </Button>

            {vehicle.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.VEHICLES.UPDATE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restore(vehicle.id)}
                  loading={restoring}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {tc('actions.restore')}
                </Button>
              </PermissionGate>
            ) : (
              <>
                <PermissionGate permission={PERMISSIONS.VEHICLES.UPDATE}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={isEditing ? cancelEdit : startEdit}
                  >
                    <Edit className="mr-1 h-4 w-4" />
                    {isEditing ? tc('actions.cancel') : tc('actions.edit')}
                  </Button>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.VEHICLES.DELETE}>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {tc('actions.delete')}
                  </Button>
                </PermissionGate>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main card */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Car className="h-5 w-5 text-muted-foreground" />
                  {t('vehicleDetails')}
                </CardTitle>
                <SoftDeleteBadge deletedAt={vehicle.deletedAt} />
              </div>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="vd-make">{t('makeRequired')}</Label>
                      <Input
                        id="vd-make"
                        {...register('make')}
                        error={errors.make?.message}
                        placeholder={t('make')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vd-model">{t('model')}</Label>
                      <Input
                        id="vd-model"
                        {...register('model')}
                        placeholder={t('model')}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="vd-licensePlate">{t('licensePlate')}</Label>
                    <Input
                      id="vd-licensePlate"
                      {...register('licensePlate')}
                      placeholder={t('licensePlate')}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="vd-color">{t('color')}</Label>
                      <Input
                        id="vd-color"
                        {...register('color')}
                        placeholder={t('color')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="vd-year">{t('year')}</Label>
                      <Input
                        id="vd-year"
                        type="number"
                        {...register('year')}
                        error={errors.year?.message}
                        placeholder="2024"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelEdit}
                      disabled={updating}
                    >
                      {tc('actions.cancel')}
                    </Button>
                    <Button
                      type="submit"
                      loading={updating}
                      disabled={!isDirty}
                    >
                      {tc('actions.save')}
                    </Button>
                  </DialogFooter>
                </form>
              ) : (
                <dl className="space-y-3">
                  <DetailRow label={t('make')} value={vehicle.make} />
                  <DetailRow label={t('model')} value={vehicle.model ?? '—'} />
                  <DetailRow
                    label={t('licensePlate')}
                    value={vehicle.licensePlate ?? '—'}
                  />
                  <DetailRow label={t('color')} value={vehicle.color ?? '—'} />
                  <DetailRow
                    label={t('year')}
                    value={vehicle.year ? String(vehicle.year) : '—'}
                  />
                  <DetailRow
                    label={tc('fields.createdAt')}
                    value={formatDate(vehicle.createdAt)}
                  />
                  <DetailRow
                    label={tc('fields.updatedAt')}
                    value={formatDate(vehicle.updatedAt)}
                  />
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Owner card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-4 w-4 text-muted-foreground" />
                {t('owner')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {clientName ? (
                <Link
                  to={`/clients/${vehicle.clientId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {clientName}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
              {vehicle.client?.phone && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {vehicle.client.phone}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Quick actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {tc('actions.quickActions')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <PermissionGate permission={PERMISSIONS.ORDERS.READ}>
                <Link
                  to={`/orders?vehicleId=${vehicle.id}`}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  {tc('actions.viewOrders')}
                </Link>
              </PermissionGate>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() =>
          deleteMut(vehicle.id, {
            onSuccess: () => navigate('/vehicles'),
          })
        }
        title={tc('actions.delete')}
        message={tc('softDelete.confirmDelete')}
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
