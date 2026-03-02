import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Trash2, RotateCcw } from 'lucide-react';
import {
  useServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
  useRestoreService,
} from '../hooks/useServices';
import { ServiceForm, type ServiceFormData } from '../components/ServiceForm';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { formatCurrency, formatDuration } from '@/shared/utils/format';
import type { Service } from '@/shared/types/models';
import type { ServiceQueryParams } from '../api/services.api';

export function ServicesPage() {
  const { t } = useTranslation('services');
  const { t: tCommon } = useTranslation('common');

  const [params, setParams] = useState<ServiceQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'sortOrder',
    sortOrder: 'asc',
    includeDeleted: false,
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);

  const { data, isLoading } = useServices(params);
  const createMutation = useCreateService();
  const updateMutation = useUpdateService();
  const deleteMutation = useDeleteService();
  const restoreMutation = useRestoreService();

  const isMutating =
    createMutation.isPending || updateMutation.isPending;

  const handleOpenCreate = useCallback(() => {
    setEditingService(null);
    setFormOpen(true);
  }, []);

  const handleOpenEdit = useCallback((service: Service) => {
    setEditingService(service);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingService(null);
  }, []);

  const handleFormSubmit = useCallback(
    (data: ServiceFormData) => {
      if (editingService) {
        updateMutation.mutate(
          { id: editingService.id, ...data },
          { onSuccess: handleCloseForm },
        );
      } else {
        createMutation.mutate(data, { onSuccess: handleCloseForm });
      }
    },
    [editingService, updateMutation, createMutation, handleCloseForm],
  );

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  const handleRestore = useCallback(
    (id: string) => {
      restoreMutation.mutate(id);
    },
    [restoreMutation],
  );

  const handleIncludeDeletedChange = useCallback((checked: boolean) => {
    setParams((prev) => ({ ...prev, includeDeleted: checked, page: 1 }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const columns: Column<Service>[] = useMemo(
    () => [
      {
        key: 'name',
        header: t('fields.name'),
        render: (service) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{service.name}</span>
            <SoftDeleteBadge deletedAt={service.deletedAt} />
          </div>
        ),
      },
      {
        key: 'duration',
        header: t('fields.duration'),
        render: (service) => formatDuration(service.durationMin),
        className: 'hidden sm:table-cell',
      },
      {
        key: 'price',
        header: t('fields.price'),
        render: (service) => formatCurrency(service.price),
      },
      {
        key: 'status',
        header: t('fields.status'),
        render: (service) => (
          <Badge variant={service.isActive ? 'success' : 'secondary'}>
            {service.isActive
              ? tCommon('status.active')
              : tCommon('status.inactive')}
          </Badge>
        ),
        className: 'hidden md:table-cell',
      },
      {
        key: 'sortOrder',
        header: t('fields.sortOrder'),
        render: (service) => service.sortOrder,
        className: 'hidden lg:table-cell',
      },
      {
        key: 'actions',
        header: '',
        render: (service) => (
          <div className="flex items-center justify-end gap-1">
            {service.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.SERVICES.UPDATE}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRestore(service.id);
                  }}
                  title={tCommon('actions.restore')}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </PermissionGate>
            ) : (
              <>
                <PermissionGate permission={PERMISSIONS.SERVICES.UPDATE}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(service);
                    }}
                    title={tCommon('actions.edit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.SERVICES.DELETE}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(service);
                    }}
                    title={tCommon('actions.delete')}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </PermissionGate>
              </>
            )}
          </div>
        ),
        className: 'w-24',
      },
    ],
    [t, tCommon, handleRestore, handleOpenEdit],
  );

  return (
    <div>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <PermissionGate permission={PERMISSIONS.SERVICES.CREATE}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              {t('createService')}
            </Button>
          </PermissionGate>
        }
      />

      <div className="mb-4">
        <IncludeDeletedToggle
          checked={params.includeDeleted ?? false}
          onChange={handleIncludeDeletedChange}
        />
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        page={params.page ?? 1}
        totalPages={data?.meta.totalPages ?? 1}
        total={data?.meta.total ?? 0}
        limit={params.limit ?? 20}
        onPageChange={handlePageChange}
        emptyMessage={t('emptyState')}
      />

      <ServiceForm
        open={formOpen}
        onClose={handleCloseForm}
        onSubmit={handleFormSubmit}
        service={editingService}
        loading={isMutating}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('deleteTitle')}
        message={t('deleteMessage', { name: deleteTarget?.name })}
        confirmLabel={tCommon('actions.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
