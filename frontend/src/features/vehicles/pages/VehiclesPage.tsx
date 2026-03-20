import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useVehicles,
  useCreateVehicle,
  useDeleteVehicle,
  useRestoreVehicle,
} from '../hooks/useVehicles';
import { fetchClients } from '@/features/clients/api/clients.api';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Combobox } from '@/shared/ui/combobox';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useDebounce } from '@/shared/hooks/useDebounce';
import type { Vehicle } from '@/shared/types/models';

const vehicleSchema = z.object({
  clientId: z.string().uuid('Select a client'),
  licensePlate: z.string().optional(),
  make: z.string().min(1, 'Make is required'),
  model: z.string().optional(),
  color: z.string().optional(),
  year: z.preprocess(
    (v) => (v === '' || v === undefined || v === null ? undefined : Number(v)),
    z.number().int().min(1900).max(2100).optional(),
  ),
});

type VehicleFormData = z.infer<typeof vehicleSchema>;

export function VehiclesPage() {
  const { t } = useTranslation('vehicles');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const debouncedClientSearch = useDebounce(clientSearch, 300);

  const { data, isLoading, isError } = useVehicles({
    page,
    limit,
    includeDeleted,
  });
  const { mutate: createMut, isPending: creating } = useCreateVehicle();
  const { mutate: deleteMut, isPending: deleting } = useDeleteVehicle();
  const { mutate: restoreMut } = useRestoreVehicle();

  const { data: clientsData, isLoading: loadingClients } = useQuery({
    queryKey: ['clients', 'search', debouncedClientSearch],
    queryFn: () =>
      fetchClients({ search: debouncedClientSearch || undefined, limit: 20 }),
    staleTime: 30_000,
  });

  const clientOptions = useMemo(
    () =>
      (clientsData?.items ?? []).map((c) => ({
        value: c.id,
        label: [c.firstName, c.lastName].filter(Boolean).join(' '),
        sublabel: c.phone ?? undefined,
      })),
    [clientsData],
  );

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<VehicleFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(vehicleSchema) as any,
  });

  const columns: Column<Vehicle>[] = useMemo(
    () => [
      {
        key: 'make',
        header: t('makeModel'),
        render: (v) => (
          <span className="font-medium">
            {v.make} {v.model ?? ''}
          </span>
        ),
      },
      {
        key: 'licensePlate',
        header: t('licensePlate'),
        render: (v) => v.licensePlate ?? '—',
        className: 'hidden md:table-cell',
      },
      {
        key: 'year',
        header: t('year'),
        render: (v) => v.year ?? '—',
        className: 'hidden lg:table-cell',
      },
      {
        key: 'client',
        header: t('client'),
        render: (v) =>
          v.client
            ? [v.client.firstName, v.client.lastName].filter(Boolean).join(' ')
            : '—',
      },
      {
        key: 'status',
        header: t('status'),
        render: (v) => (
          <div className="flex items-center gap-2">
            <SoftDeleteBadge deletedAt={v.deletedAt} />
            {v.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.VEHICLES.UPDATE}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={tc('actions.restore')}
                  onClick={(e) => {
                    e.stopPropagation();
                    restoreMut(v.id);
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate permission={PERMISSIONS.VEHICLES.DELETE}>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={tc('actions.delete')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(v);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </PermissionGate>
            )}
          </div>
        ),
      },
    ],
    [t, tc, restoreMut],
  );

  const onSubmit = useCallback(
    (formData: VehicleFormData) => {
      createMut(formData, {
        onSuccess: () => {
          setCreateOpen(false);
          reset();
          setClientSearch('');
        },
      });
    },
    [createMut, reset],
  );

  const handleOpenCreate = useCallback(() => {
    reset();
    setClientSearch('');
    setCreateOpen(true);
  }, [reset]);

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <PermissionGate permission={PERMISSIONS.VEHICLES.CREATE}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" /> {t('addVehicle')}
            </Button>
          </PermissionGate>
        }
      />

      <div className="mb-4">
        <IncludeDeletedToggle
          checked={includeDeleted}
          onChange={setIncludeDeleted}
        />
      </div>

      {isError ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{tc('errors.loadFailed')}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          page={page}
          totalPages={data?.meta.totalPages ?? 1}
          total={data?.meta.total ?? 0}
          limit={limit}
          onPageChange={setPage}
          onLimitChange={(v) => {
            setLimit(v);
            setPage(1);
          }}
          onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
        />
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('addVehicle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="v-clientId">{t('client')}</Label>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <Combobox
                  options={clientOptions}
                  value={field.value}
                  onChange={field.onChange}
                  onSearch={setClientSearch}
                  placeholder={tc('actions.search')}
                  loading={loadingClients}
                  error={errors.clientId?.message}
                />
              )}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="v-make">{t('makeRequired')}</Label>
              <Input
                id="v-make"
                {...register('make')}
                error={errors.make?.message}
              />
            </div>
            <div>
              <Label htmlFor="v-model">{t('model')}</Label>
              <Input id="v-model" {...register('model')} />
            </div>
          </div>
          <div>
            <Label htmlFor="v-licensePlate">{t('licensePlate')}</Label>
            <Input id="v-licensePlate" {...register('licensePlate')} />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="v-color">{t('color')}</Label>
              <Input id="v-color" {...register('color')} />
            </div>
            <div>
              <Label htmlFor="v-year">{t('year')}</Label>
              <Input
                id="v-year"
                type="number"
                {...register('year')}
                error={errors.year?.message}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setCreateOpen(false)}
            >
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" loading={creating}>
              {tc('actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget)
            deleteMut(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
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
