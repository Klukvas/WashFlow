import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Pencil, Power, PowerOff } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { Combobox } from '@/shared/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Switch } from '@/shared/ui/switch';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useUsers } from '@/features/users/hooks/useUsers';
import {
  useBranches,
  useBranchBookingSettings,
} from '@/features/branches/hooks/useBranches';
import {
  useProfiles,
  useCreateProfile,
  useUpdateProfile,
  useDeactivateProfile,
} from '../hooks/useWorkforce';
import type { EmployeeProfile } from '@/shared/types/models';

// ─── Schema ───────────────────────────────────────────────────

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

const profileSchema = z.object({
  userId: z.string().uuid('Select a user'),
  branchId: z.string().uuid('Select a branch'),
  isWorker: z.boolean(),
  workStartTime: z
    .string()
    .regex(timePattern, 'HH:MM format')
    .or(z.literal('')),
  workEndTime: z.string().regex(timePattern, 'HH:MM format').or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

// ─── Page ─────────────────────────────────────────────────────

export function WorkforcePage() {
  const { t } = useTranslation('workforce');
  const { t: tc } = useTranslation('common');
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<EmployeeProfile | null>(null);
  const [deactivateTarget, setDeactivateTarget] =
    useState<EmployeeProfile | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [branchSearch, setBranchSearch] = useState('');
  const [apiError, setApiError] = useState<string | null>(null);

  const { data, isLoading } = useProfiles({ page, limit: 20 });
  const { data: usersData, isLoading: loadingUsers } = useUsers({
    page: 1,
    limit: 100,
  });
  const { data: branchesData, isLoading: loadingBranches } = useBranches({
    page: 1,
    limit: 100,
  });
  const createMutation = useCreateProfile();
  const updateMutation = useUpdateProfile();
  const deactivateMutation = useDeactivateProfile();

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema) as any,
    defaultValues: {
      userId: '',
      branchId: '',
      isWorker: true,
      workStartTime: '',
      workEndTime: '',
    },
  });

  // Auto-fill working hours from branch booking settings (create mode only)
  const selectedBranchId = form.watch('branchId');
  const { data: branchSettings } = useBranchBookingSettings(
    !editProfile ? (selectedBranchId ?? '') : '',
  );

  useEffect(() => {
    if (editProfile || !branchSettings) return;
    if (!form.getValues('workStartTime') && branchSettings.workingHoursStart) {
      form.setValue('workStartTime', branchSettings.workingHoursStart);
    }
    if (!form.getValues('workEndTime') && branchSettings.workingHoursEnd) {
      form.setValue('workEndTime', branchSettings.workingHoursEnd);
    }
  }, [branchSettings, editProfile, form]);

  const userOptions = (usersData?.items ?? [])
    .filter((u) => {
      const q = userSearch.toLowerCase();
      return (
        !q ||
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q)
      );
    })
    .map((u) => ({
      value: u.id,
      label: `${u.firstName} ${u.lastName}`,
      sublabel: u.email,
    }));

  const branchOptions = (branchesData?.items ?? [])
    .filter((b) => {
      const q = branchSearch.toLowerCase();
      return !q || b.name.toLowerCase().includes(q);
    })
    .map((b) => ({ value: b.id, label: b.name }));

  const openCreate = () => {
    form.reset({
      userId: '',
      branchId: '',
      isWorker: true,
      workStartTime: '',
      workEndTime: '',
    });
    setEditProfile(null);
    setUserSearch('');
    setBranchSearch('');
    setApiError(null);
    setDialogOpen(true);
  };

  const openEdit = (profile: EmployeeProfile) => {
    form.reset({
      userId: profile.userId,
      branchId: profile.branchId,
      isWorker: profile.isWorker,
      workStartTime: profile.workStartTime ?? '',
      workEndTime: profile.workEndTime ?? '',
    });
    setEditProfile(profile);
    setBranchSearch('');
    setApiError(null);
    setDialogOpen(true);
  };

  const onSubmit = async (values: ProfileFormValues) => {
    setApiError(null);
    const payload = {
      branchId: values.branchId,
      isWorker: values.isWorker,
      workStartTime: values.workStartTime || undefined,
      workEndTime: values.workEndTime || undefined,
    };
    try {
      if (editProfile) {
        await updateMutation.mutateAsync({ id: editProfile.id, payload });
      } else {
        await createMutation.mutateAsync({ userId: values.userId, ...payload });
      }
      setDialogOpen(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? 'Something went wrong';
      setApiError(msg);
    }
  };

  const columns = useMemo<Column<EmployeeProfile>[]>(
    () => [
      {
        key: 'name',
        header: t('name'),
        render: (p) => `${p.user.firstName} ${p.user.lastName}`,
      },
      {
        key: 'email',
        header: t('email'),
        className: 'hidden md:table-cell text-muted-foreground',
        render: (p) => p.user.email,
      },
      {
        key: 'branch',
        header: t('branch'),
        className: 'hidden sm:table-cell',
        render: (p) => p.branch.name,
      },
      {
        key: 'hours',
        header: t('hours'),
        className: 'hidden sm:table-cell',
        render: (p) =>
          p.workStartTime && p.workEndTime
            ? `${p.workStartTime} – ${p.workEndTime}`
            : '—',
      },
      {
        key: 'status',
        header: t('status'),
        render: (p) => (
          <Badge variant={p.active ? 'default' : 'destructive'}>
            {p.active ? tc('status.active') : tc('status.inactive')}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: '',
        className: 'w-24 text-right',
        render: (p) => (
          <div
            className="flex justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <PermissionGate permission={PERMISSIONS.WORKFORCE.UPDATE}>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('editWorker')}
                onClick={() => openEdit(p)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </PermissionGate>
            {p.active ? (
              <PermissionGate permission={PERMISSIONS.WORKFORCE.DELETE}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t('deactivateConfirm')}
                  onClick={() => setDeactivateTarget(p)}
                >
                  <PowerOff className="h-4 w-4 text-destructive" />
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate permission={PERMISSIONS.WORKFORCE.UPDATE}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={tc('status.active')}
                  onClick={() =>
                    updateMutation.mutateAsync({
                      id: p.id,
                      payload: { active: true },
                    })
                  }
                >
                  <Power className="h-4 w-4 text-success" />
                </Button>
              </PermissionGate>
            )}
          </div>
        ),
      },
    ],
    [t, tc, openEdit, updateMutation],
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader title={t('title')} description={t('description')} />

      <div className="flex justify-end">
        <PermissionGate permission={PERMISSIONS.WORKFORCE.CREATE}>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            {t('addWorker')}
          </Button>
        </PermissionGate>
      </div>

      <DataTable<EmployeeProfile>
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        page={page}
        totalPages={data?.meta.totalPages}
        total={data?.meta.total}
        limit={20}
        onPageChange={setPage}
        emptyMessage={t('noProfiles')}
      />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editProfile ? t('editWorker') : t('addWorker')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!editProfile && (
              <div className="space-y-1">
                <Label>{t('user')}</Label>
                <Controller
                  name="userId"
                  control={form.control}
                  render={({ field }) => (
                    <Combobox
                      options={userOptions}
                      value={field.value}
                      onChange={field.onChange}
                      onSearch={setUserSearch}
                      placeholder={t('searchByNameOrEmail')}
                      loading={loadingUsers}
                      error={form.formState.errors.userId?.message}
                    />
                  )}
                />
              </div>
            )}
            <div className="space-y-1">
              <Label>{t('branch')}</Label>
              <Controller
                name="branchId"
                control={form.control}
                render={({ field }) => (
                  <Combobox
                    options={branchOptions}
                    value={field.value}
                    onChange={field.onChange}
                    onSearch={setBranchSearch}
                    placeholder={t('selectBranch')}
                    loading={loadingBranches}
                    error={form.formState.errors.branchId?.message}
                  />
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>{t('startTime')}</Label>
                <Input {...form.register('workStartTime')} type="time" />
              </div>
              <div className="space-y-1">
                <Label>{t('endTime')}</Label>
                <Input {...form.register('workEndTime')} type="time" />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.watch('isWorker')}
                onCheckedChange={(v) => form.setValue('isWorker', v)}
              />
              <Label>{t('isWorkerLabel')}</Label>
            </div>
            {apiError && <p className="text-sm text-destructive">{apiError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                {tc('actions.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editProfile ? tc('actions.save') : tc('actions.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        open={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title={t('deactivateTitle')}
        message={t('deactivateMessage', {
          name: `${deactivateTarget?.user.firstName} ${deactivateTarget?.user.lastName}`,
        })}
        confirmLabel={t('deactivateConfirm')}
        variant="destructive"
        onConfirm={async () => {
          if (deactivateTarget) {
            await deactivateMutation.mutateAsync(deactivateTarget.id);
            setDeactivateTarget(null);
          }
        }}
      />
    </div>
  );
}
