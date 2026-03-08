import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, RotateCcw, Edit, KeyRound } from 'lucide-react';
import {
  useUsers,
  useCreateUser,
  useUpdateUser,
  useDeleteUser,
  useRestoreUser,
} from '../hooks/useUsers';
import { UserForm } from '../components/UserForm';
import { ResetPasswordDialog } from '../components/ResetPasswordDialog';
import { PageHeader } from '@/shared/components/PageHeader';
import { DataTable, type Column } from '@/shared/components/DataTable';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { IncludeDeletedToggle } from '@/shared/components/IncludeDeletedToggle';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Dialog, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { PERMISSIONS } from '@/shared/constants/permissions';
import { useAuthStore } from '@/shared/stores/auth.store';
import type { User } from '@/shared/types/models';
import type {
  UserQueryParams,
  CreateUserPayload,
  UpdateUserPayload,
} from '../api/users.api';

export function UsersPage() {
  const { t } = useTranslation('common');
  const { t: tAuth } = useTranslation('auth');
  const { user: currentUser } = useAuthStore();

  const [params, setParams] = useState<UserQueryParams>({
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    includeDeleted: false,
  });

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<User | null>(null);
  const [resetPasswordTarget, setResetPasswordTarget] = useState<User | null>(
    null,
  );

  const { data, isLoading } = useUsers(params);
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const deleteMutation = useDeleteUser();
  const restoreMutation = useRestoreUser();

  const handleOpenCreate = useCallback(() => {
    setEditingUser(null);
    setFormDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback((user: User) => {
    setEditingUser(user);
    setFormDialogOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormDialogOpen(false);
    setEditingUser(null);
  }, []);

  const handleFormSubmit = useCallback(
    (formData: CreateUserPayload | UpdateUserPayload) => {
      if (editingUser) {
        updateMutation.mutate(
          { id: editingUser.id, ...formData },
          { onSuccess: handleCloseForm },
        );
      } else {
        createMutation.mutate(formData as CreateUserPayload, {
          onSuccess: handleCloseForm,
        });
      }
    },
    [editingUser, updateMutation, createMutation, handleCloseForm],
  );

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  const handleConfirmRestore = useCallback(() => {
    if (!restoreTarget) return;
    restoreMutation.mutate(restoreTarget.id, {
      onSuccess: () => setRestoreTarget(null),
    });
  }, [restoreTarget, restoreMutation]);

  const handlePageChange = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  const handleLimitChange = useCallback((limit: number) => {
    setParams((prev) => ({ ...prev, limit, page: 1 }));
  }, []);

  const handleIncludeDeletedChange = useCallback((checked: boolean) => {
    setParams((prev) => ({ ...prev, includeDeleted: checked, page: 1 }));
  }, []);

  const columns = useMemo<Column<User>[]>(
    () => [
      {
        key: 'name',
        header: t('fields.name'),
        render: (user) => (
          <div className="flex items-center gap-2">
            <span className="font-medium">
              {user.firstName} {user.lastName}
            </span>
            <SoftDeleteBadge deletedAt={user.deletedAt} />
          </div>
        ),
      },
      {
        key: 'email',
        header: t('fields.email'),
        render: (user) => user.email,
      },
      {
        key: 'phone',
        header: t('fields.phone'),
        render: (user) => user.phone ?? '-',
        className: 'hidden md:table-cell',
      },
      {
        key: 'role',
        header: t('fields.role'),
        render: (user) => user.role?.name ?? '-',
        className: 'hidden lg:table-cell',
      },
      {
        key: 'branch',
        header: t('fields.branch'),
        render: (user) => user.branch?.name ?? '-',
        className: 'hidden lg:table-cell',
      },
      {
        key: 'actions',
        header: '',
        className: 'w-32 text-right',
        render: (user) => (
          <div
            className="flex items-center justify-end gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {user.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.USERS.UPDATE}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setRestoreTarget(user)}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </PermissionGate>
            ) : (
              <>
                <PermissionGate permission={PERMISSIONS.USERS.UPDATE}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setResetPasswordTarget(user)}
                    aria-label={tAuth('resetPassword.button')}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </PermissionGate>
                <PermissionGate permission={PERMISSIONS.USERS.UPDATE}>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenEdit(user)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </PermissionGate>
                {user.id !== currentUser?.id && (
                  <PermissionGate permission={PERMISSIONS.USERS.DELETE}>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteTarget(user)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </PermissionGate>
                )}
              </>
            )}
          </div>
        ),
      },
    ],
    [t, tAuth, handleOpenEdit],
  );

  return (
    <div>
      <PageHeader
        title={t('pages.users')}
        actions={
          <PermissionGate permission={PERMISSIONS.USERS.CREATE}>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              {t('actions.create')}
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

      <DataTable<User>
        columns={columns}
        data={data?.items ?? []}
        loading={isLoading}
        page={params.page ?? 1}
        totalPages={data?.meta.totalPages ?? 1}
        total={data?.meta.total ?? 0}
        limit={params.limit ?? 20}
        onPageChange={handlePageChange}
        onLimitChange={handleLimitChange}
      />

      <Dialog open={formDialogOpen} onClose={handleCloseForm}>
        <DialogHeader>
          <DialogTitle>
            {editingUser ? t('actions.edit') : t('actions.create')}
          </DialogTitle>
        </DialogHeader>
        <UserForm
          user={editingUser}
          onSubmit={handleFormSubmit}
          onCancel={handleCloseForm}
          isPending={createMutation.isPending || updateMutation.isPending}
        />
      </Dialog>

      <ResetPasswordDialog
        open={!!resetPasswordTarget}
        userId={resetPasswordTarget?.id ?? null}
        userName={
          resetPasswordTarget
            ? `${resetPasswordTarget.firstName} ${resetPasswordTarget.lastName}`
            : ''
        }
        onClose={() => setResetPasswordTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title={t('confirm.deleteTitle')}
        message={t('confirm.deleteMessage', {
          name: deleteTarget
            ? `${deleteTarget.firstName} ${deleteTarget.lastName}`
            : '',
        })}
        confirmLabel={t('actions.delete')}
        variant="destructive"
        loading={deleteMutation.isPending}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleConfirmRestore}
        title={t('confirm.restoreTitle')}
        message={t('confirm.restoreMessage', {
          name: restoreTarget
            ? `${restoreTarget.firstName} ${restoreTarget.lastName}`
            : '',
        })}
        confirmLabel={t('actions.restore')}
        loading={restoreMutation.isPending}
      />
    </div>
  );
}
