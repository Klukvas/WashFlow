import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useRoles, useCreateRole } from '../hooks/useRoles';
import { RoleForm } from '../components/RoleForm';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import type { Role } from '@/shared/types/models';
import type { RoleQueryParams } from '../api/roles.api';

export function RolesPage() {
  const { t } = useTranslation('roles');
  const navigate = useNavigate();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [params, setParams] = useState<RoleQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'name',
    sortOrder: 'asc',
    includeDeleted: false,
  });

  const { data, isLoading } = useRoles(params);
  const { mutate: create, isPending: creating } = useCreateRole();

  const columns = useMemo<Column<Role>[]>(
    () => [
      {
        key: 'name',
        header: t('fields.name'),
        render: (role) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{role.name}</span>
            <SoftDeleteBadge deletedAt={role.deletedAt} />
          </div>
        ),
      },
      {
        key: 'description',
        header: t('fields.description'),
        render: (role) => (
          <span className="text-muted-foreground">
            {role.description || '---'}
          </span>
        ),
      },
      {
        key: 'permissions',
        header: t('fields.permissionsCount'),
        render: (role) => (
          <span className="text-muted-foreground">
            {role.permissions?.length ?? 0}
          </span>
        ),
      },
    ],
    [t],
  );

  const handleRowClick = (role: Role) => {
    navigate(`/roles/${role.id}`);
  };

  const handleCreateSubmit = (data: { name: string; description?: string }) => {
    create(data, {
      onSuccess: () => {
        setCreateDialogOpen(false);
      },
    });
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <PermissionGate permission={PERMISSIONS.ROLES.CREATE}>
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              {t('createRole')}
            </Button>
          </PermissionGate>
        }
      />

      <div className="mb-4">
        <IncludeDeletedToggle
          checked={params.includeDeleted ?? false}
          onChange={(checked) =>
            setParams((prev) => ({
              ...prev,
              includeDeleted: checked,
              page: 1,
            }))
          }
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
        onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
        onRowClick={handleRowClick}
        emptyMessage={t('emptyState')}
      />

      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('createRole')}</DialogTitle>
        </DialogHeader>
        <RoleForm onSubmit={handleCreateSubmit} isPending={creating} />
      </Dialog>
    </div>
  );
}
