import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useWorkPosts, useCreateWorkPost } from '../hooks/useWorkPosts';
import { useBranches } from '@/features/branches/hooks/useBranches';
import type { WorkPost } from '@/shared/types/models';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useBranchScope } from '@/shared/hooks/useBranchScope';

const workPostSchema = z.object({
  name: z.string().min(1, 'validation.nameRequired'),
  branchId: z.string().uuid('validation.branchRequired'),
});

type WorkPostForm = z.infer<typeof workPostSchema>;

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
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<WorkPostForm>({
    resolver: zodResolver(workPostSchema),
  });

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

  const onSubmit = (formData: WorkPostForm) => {
    createMut(formData, {
      onSuccess: () => {
        setCreateOpen(false);
        reset();
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
                if (branchFilter) setValue('branchId', branchFilter);
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
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label htmlFor="wp-branchId">{t('branch')}</Label>
            <Select
              id="wp-branchId"
              options={branches.map((b) => ({
                value: b.id,
                label: b.name,
              }))}
              {...register('branchId')}
              error={
                errors.branchId?.message
                  ? t(errors.branchId.message)
                  : undefined
              }
            />
          </div>
          <div>
            <Label htmlFor="wp-name">{t('name')}</Label>
            <Input
              id="wp-name"
              {...register('name')}
              error={errors.name?.message ? t(errors.name.message) : undefined}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              onClick={() => setCreateOpen(false)}
            >
              {tc('actions.cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {tc('actions.create')}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
