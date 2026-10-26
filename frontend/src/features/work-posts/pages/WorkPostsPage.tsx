import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import {
  WorkPostForm,
  type WorkPostFormData,
} from '../components/WorkPostForm';
import { useWorkPosts, useCreateWorkPost } from '../hooks/useWorkPosts';
import { useBranches } from '@/features/branches/hooks/useBranches';
import type { WorkPost } from '@/shared/types/models';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/select';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useBranchScope } from '@/shared/hooks/useBranchScope';

export function WorkPostsPage() {
  const { t } = useTranslation('work-posts');
  const { t: tc } = useTranslation('common');
  const { branchId: userBranchId, isBranchScoped } = useBranchScope();
  const [branchFilter, setBranchFilter] = useState(userBranchId ?? '');
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (isBranchScoped) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBranchFilter(userBranchId ?? '');
    }
  }, [userBranchId, isBranchScoped]);

  const { data: branchesData } = useBranches({ limit: 100 });
  const branches = branchesData?.items ?? [];

  const { data, isLoading, isError } = useWorkPosts({
    branchId: branchFilter || undefined,
    limit: 100,
  });
  const { mutate: createMut, isPending } = useCreateWorkPost();
  const columns: Column<WorkPost>[] = useMemo(
    () => [
      {
        key: 'name',
        header: t('name'),
        render: (wp) => <span className="font-medium">{wp.name}</span>,
      },
      ...(!isBranchScoped
        ? [
            {
              key: 'branch' as const,
              header: t('branch'),
              render: (wp: WorkPost) => (
                <span className="text-muted-foreground">
                  {wp.branch?.name ?? '—'}
                </span>
              ),
            },
          ]
        : []),
    ],
    [t, isBranchScoped],
  );

  const onSubmit = (formData: WorkPostFormData) => {
    createMut(formData, {
      onSuccess: () => {
        setCreateOpen(false);
      },
    });
  };

  return (
    <div>
      <PageHeader
        title={t('title')}
        actions={
          <PermissionGate permission={PERMISSIONS.WORK_POSTS.CREATE}>
            <Button
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> {t('addWorkPost')}
            </Button>
          </PermissionGate>
        }
      />

      {!isBranchScoped && (
        <div className="mb-4">
          <Select
            options={[
              { value: '', label: t('allBranches') },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            placeholder={t('filterByBranch')}
          />
        </div>
      )}

      {isError ? (
        <div className="flex items-center justify-center p-8">
          <p className="text-sm text-destructive">{tc('errors.loadFailed')}</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          emptyMessage={t('emptyList')}
        />
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('addWorkPost')}</DialogTitle>
        </DialogHeader>
        <WorkPostForm
          key={branchFilter || 'all'}
          branchId={branchFilter || undefined}
          branches={branches}
          onSubmit={onSubmit}
          isPending={isPending}
          onCancel={() => setCreateOpen(false)}
        />
      </Dialog>
    </div>
  );
}
