import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useWorkPosts, useCreateWorkPost } from '../hooks/useWorkPosts';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type { Branch, WorkPost } from '@/shared/types/models';
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
  name: z.string().min(1),
  branchId: z.string().uuid(),
});

type WorkPostForm = z.infer<typeof workPostSchema>;

export function WorkPostsPage() {
  const { t } = useTranslation('work-posts');
  const { t: tc } = useTranslation('common');
  const { branchId: userBranchId, isBranchScoped } = useBranchScope();
  const [branchId, setBranchId] = useState(userBranchId ?? '');
  const [createOpen, setCreateOpen] = useState(false);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Branch>>(
        '/branches',
        { params: { limit: 100 } },
      );
      return data.data;
    },
    staleTime: Infinity,
  });

  const { data, isLoading } = useWorkPosts({ branchId, limit: 100 });
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
    ],
    [t],
  );

  const onSubmit = (data: WorkPostForm) => {
    createMut(data, {
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
                if (branchId) setValue('branchId', branchId);
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
              { value: '', label: t('selectBranch') },
              ...(branches ?? []).map((b) => ({ value: b.id, label: b.name })),
            ]}
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            placeholder={t('filterByBranch')}
          />
        </div>
      )}

      {branchId && (
        <DataTable
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
        />
      )}

      {!branchId && !isBranchScoped && (
        <p className="py-12 text-center text-muted-foreground">
          {t('selectBranchPrompt')}
        </p>
      )}

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('addWorkPost')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div>
            <Label>{t('branch')}</Label>
            <Select
              options={(branches ?? []).map((b) => ({
                value: b.id,
                label: b.name,
              }))}
              {...register('branchId')}
              error={errors.branchId?.message}
            />
          </div>
          <div>
            <Label>{t('name')}</Label>
            <Input {...register('name')} error={errors.name?.message} />
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
