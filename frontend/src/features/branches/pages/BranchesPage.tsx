import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Plus, MapPin, Phone } from 'lucide-react';
import { useBranches, useCreateBranch } from '../hooks/useBranches';
import { BranchForm, type BranchFormData } from '../components/BranchForm';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { formatDateTime } from '@/shared/utils/format';
import type { Branch } from '@/shared/types/models';
import type { BranchQueryParams } from '../api/branches.api';

export function BranchesPage() {
  const { t } = useTranslation('branches');
  const { t: tc } = useTranslation('common');
  const navigate = useNavigate();

  const [params, setParams] = useState<BranchQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'name',
    sortOrder: 'asc',
    includeDeleted: false,
  });

  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useBranches(params);
  const { mutate: createMut, isPending: creating } = useCreateBranch();

  const handleCreate = (formData: BranchFormData) => {
    createMut(formData, {
      onSuccess: () => setCreateOpen(false),
    });
  };

  const handleRowClick = (branch: Branch) => {
    navigate(`/branches/${branch.id}`);
  };

  const columns = useMemo<Column<Branch>[]>(
    () => [
      {
        key: 'name',
        header: t('fields.name'),
        render: (branch) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">{branch.name}</span>
            <SoftDeleteBadge deletedAt={branch.deletedAt} />
          </div>
        ),
      },
      {
        key: 'address',
        header: t('fields.address'),
        className: 'hidden md:table-cell',
        render: (branch) =>
          branch.address ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span>{branch.address}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">--</span>
          ),
      },
      {
        key: 'phone',
        header: t('fields.phone'),
        className: 'hidden lg:table-cell',
        render: (branch) =>
          branch.phone ? (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              <span>{branch.phone}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">--</span>
          ),
      },
      {
        key: 'createdAt',
        header: tc('fields.createdAt'),
        className: 'hidden xl:table-cell',
        render: (branch) => (
          <span className="text-muted-foreground">
            {formatDateTime(branch.createdAt)}
          </span>
        ),
      },
    ],
    [t, tc],
  );

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex items-center gap-3">
            <PermissionGate permission={PERMISSIONS.BRANCHES.DELETE}>
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
            </PermissionGate>
            <PermissionGate permission={PERMISSIONS.BRANCHES.CREATE}>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                {t('createBranch')}
              </Button>
            </PermissionGate>
          </div>
        }
      />

      <DataTable<Branch>
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        page={params.page ?? 1}
        totalPages={data?.meta.totalPages ?? 1}
        total={data?.meta.total ?? 0}
        limit={params.limit ?? 20}
        onPageChange={(page) => setParams((prev) => ({ ...prev, page }))}
        onRowClick={handleRowClick}
        emptyMessage={t('emptyList')}
      />

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('createBranch')}</DialogTitle>
        </DialogHeader>
        <BranchForm
          onSubmit={handleCreate}
          isPending={creating}
          onCancel={() => setCreateOpen(false)}
        />
      </Dialog>
    </div>
  );
}
