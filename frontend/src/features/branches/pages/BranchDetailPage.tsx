import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Pencil, Trash2, RotateCcw, Settings } from 'lucide-react';
import {
  useBranch,
  useUpdateBranch,
  useDeleteBranch,
  useRestoreBranch,
  useWorkPosts,
  useBranchBookingSettings,
  useUpdateBranchBookingSettings,
} from '../hooks/useBranches';
import { BranchForm, type BranchFormData } from '../components/BranchForm';
import {
  BookingSettingsForm,
  type BookingSettingsFormData,
} from '../components/BookingSettingsForm';
import { PageHeader } from '@/shared/components/PageHeader';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { formatDateTime } from '@/shared/utils/format';
import type { WorkPost } from '@/shared/types/models';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
const DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 0] as const;

function buildWorkPostColumns(tc: (key: string) => string): Column<WorkPost>[] {
  return [
    {
      key: 'name',
      header: tc('fields.name'),
      render: (wp) => <span className="font-medium">{wp.name}</span>,
    },
    {
      key: 'createdAt',
      header: tc('fields.createdAt'),
      render: (wp) => (
        <span className="text-muted-foreground">
          {formatDateTime(wp.createdAt)}
        </span>
      ),
    },
  ];
}

function formatWorkingDays(days: number[], t: (key: string) => string): string {
  return DAY_NUMBERS.filter((d) => days.includes(d))
    .map((d) => {
      const idx = DAY_NUMBERS.indexOf(d);
      return t(`days.${DAY_KEYS[idx]}`);
    })
    .join(', ');
}

export function BranchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('branches');
  const { t: tc } = useTranslation('common');

  const { data: branch, isLoading } = useBranch(id!);
  const { mutate: updateMut, isPending: updating } = useUpdateBranch();
  const { mutate: deleteMut, isPending: deleting } = useDeleteBranch();
  const { mutate: restoreMut, isPending: restoring } = useRestoreBranch();
  const { data: workPostsData, isLoading: loadingWorkPosts } = useWorkPosts({
    branchId: id!,
    limit: 100,
  });
  const { data: bookingSettings, isLoading: loadingSettings } =
    useBranchBookingSettings(id!);
  const { mutate: updateSettingsMut, isPending: updatingSettings } =
    useUpdateBranchBookingSettings();

  const workPostColumns = useMemo(() => buildWorkPostColumns(tc), [tc]);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!branch) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {tc('errors.notFound')}
      </div>
    );
  }

  const handleUpdate = (data: BranchFormData) => {
    updateMut(
      { id: branch.id, ...data },
      { onSuccess: () => setEditOpen(false) },
    );
  };

  const handleDelete = () => {
    deleteMut(branch.id, {
      onSuccess: () => navigate('/branches'),
    });
  };

  const handleUpdateSettings = (data: BookingSettingsFormData) => {
    updateSettingsMut(
      { branchId: branch.id, ...data },
      { onSuccess: () => setSettingsOpen(false) },
    );
  };

  return (
    <div>
      <PageHeader
        title={branch.name}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/branches')}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('actions.back')}
            </Button>

            {branch.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.BRANCHES.UPDATE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreMut(branch.id)}
                  loading={restoring}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {tc('actions.restore')}
                </Button>
              </PermissionGate>
            ) : (
              <>
                <PermissionGate permission={PERMISSIONS.BRANCHES.UPDATE}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    {tc('actions.edit')}
                  </Button>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.BRANCHES.DELETE}>
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
        <div className="space-y-6 lg:col-span-2">
          {/* Branch info */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{t('details')}</CardTitle>
                <SoftDeleteBadge deletedAt={branch.deletedAt} />
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.name')}
                </span>
                <span className="font-medium">{branch.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.address')}
                </span>
                <span className="font-medium">{branch.address ?? '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.phone')}
                </span>
                <span className="font-medium">{branch.phone ?? '--'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('fields.status')}
                </span>
                <span className="font-medium">
                  {branch.isActive
                    ? tc('status.active')
                    : tc('status.inactive')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {tc('fields.createdAt')}
                </span>
                <span className="font-medium">
                  {formatDateTime(branch.createdAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {tc('fields.updatedAt')}
                </span>
                <span className="font-medium">
                  {formatDateTime(branch.updatedAt)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Work Posts sub-list */}
          <PermissionGate permission={PERMISSIONS.WORK_POSTS.READ}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('workPosts')}</CardTitle>
              </CardHeader>
              <CardContent>
                <DataTable<WorkPost>
                  columns={workPostColumns}
                  data={workPostsData?.items ?? []}
                  loading={loadingWorkPosts}
                  emptyMessage={t('emptyWorkPosts')}
                />
              </CardContent>
            </Card>
          </PermissionGate>

          {/* Booking Settings */}
          <PermissionGate permission={PERMISSIONS.BRANCHES.READ}>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">
                      {t('bookingSettings')}
                    </CardTitle>
                    {!loadingSettings && !bookingSettings && (
                      <Badge variant="secondary">{t('usingDefaults')}</Badge>
                    )}
                  </div>
                  {!branch.deletedAt && (
                    <PermissionGate permission={PERMISSIONS.BRANCHES.UPDATE}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSettingsOpen(true)}
                      >
                        <Settings className="mr-1 h-4 w-4" />
                        {tc('actions.edit')}
                      </Button>
                    </PermissionGate>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {loadingSettings ? (
                  <div className="space-y-3">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                  </div>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.workingHoursStart')}
                      </span>
                      <span className="font-medium">
                        {bookingSettings?.workingHoursStart ?? '08:00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.workingHoursEnd')}
                      </span>
                      <span className="font-medium">
                        {bookingSettings?.workingHoursEnd ?? '20:00'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.slotDurationMinutes')}
                      </span>
                      <span className="font-medium">
                        {bookingSettings?.slotDurationMinutes ?? 30}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.bufferTimeMinutes')}
                      </span>
                      <span className="font-medium">
                        {bookingSettings?.bufferTimeMinutes ?? 10}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.maxAdvanceBookingDays')}
                      </span>
                      <span className="font-medium">
                        {bookingSettings?.maxAdvanceBookingDays ?? 30}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.allowOnlineBooking')}
                      </span>
                      <span className="font-medium">
                        {(bookingSettings?.allowOnlineBooking ?? true)
                          ? tc('status.active')
                          : tc('status.inactive')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t('bookingFields.workingDays')}
                      </span>
                      <span className="font-medium">
                        {formatWorkingDays(
                          bookingSettings?.workingDays ?? [1, 2, 3, 4, 5, 6],
                          t,
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </PermissionGate>
        </div>

        {/* Sidebar meta info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('summary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('workPostCount')}
                </span>
                <span className="font-semibold">
                  {workPostsData?.meta.total ?? 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">ID</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {branch.id}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)}>
        <DialogHeader>
          <DialogTitle>{t('editBranch')}</DialogTitle>
        </DialogHeader>
        <BranchForm
          branch={branch}
          onSubmit={handleUpdate}
          isPending={updating}
          onCancel={() => setEditOpen(false)}
        />
      </Dialog>

      {/* Booking settings dialog */}
      <Dialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        className="max-w-2xl"
      >
        <DialogHeader>
          <DialogTitle>{t('editBookingSettings')}</DialogTitle>
        </DialogHeader>
        <BookingSettingsForm
          settings={bookingSettings ?? null}
          onSubmit={handleUpdateSettings}
          isPending={updatingSettings}
          onCancel={() => setSettingsOpen(false)}
        />
      </Dialog>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={handleDelete}
        title={tc('actions.delete')}
        message={tc('softDelete.confirmDelete')}
        variant="destructive"
        loading={deleting}
      />
    </div>
  );
}
