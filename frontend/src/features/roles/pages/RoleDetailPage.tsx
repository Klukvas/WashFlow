import { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Trash2, RotateCcw } from 'lucide-react';
import {
  useRole,
  useUpdateRole,
  useDeleteRole,
  useRestoreRole,
} from '../hooks/useRoles';
import { RoleForm } from '../components/RoleForm';
import { PermissionAssignment } from '../components/PermissionAssignment';
import { PageHeader } from '@/shared/components/PageHeader';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { PermissionGate } from '@/shared/components/PermissionGate';
import { ConfirmDialog } from '@/shared/components/ConfirmDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { PERMISSIONS } from '@/shared/constants/permissions';

export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation('roles');
  const { t: tc } = useTranslation('common');

  const { data: role, isLoading } = useRole(id!);
  const { mutate: update, isPending: updating } = useUpdateRole();
  const { mutate: deleteRoleMut, isPending: deleting } = useDeleteRole();
  const { mutate: restoreRoleMut, isPending: restoring } = useRestoreRole();

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleUpdate = (data: { name: string; description?: string }) => {
    update({ id: id!, ...data });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!role) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        {tc('errors.notFound')}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={role.name}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/roles')}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              {tc('actions.back')}
            </Button>
            <SoftDeleteBadge deletedAt={role.deletedAt} />
            {role.deletedAt ? (
              <PermissionGate permission={PERMISSIONS.ROLES.UPDATE}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => restoreRoleMut(role.id)}
                  loading={restoring}
                >
                  <RotateCcw className="mr-1 h-4 w-4" />
                  {tc('actions.restore')}
                </Button>
              </PermissionGate>
            ) : (
              <PermissionGate permission={PERMISSIONS.ROLES.DELETE}>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setDeleteConfirm(true)}
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  {tc('actions.delete')}
                </Button>
              </PermissionGate>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        <PermissionGate permission={PERMISSIONS.ROLES.UPDATE}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('editRole')}</CardTitle>
            </CardHeader>
            <CardContent>
              <RoleForm
                role={role}
                onSubmit={handleUpdate}
                isPending={updating}
              />
            </CardContent>
          </Card>
        </PermissionGate>

        <PermissionGate permission={PERMISSIONS.ROLES.UPDATE}>
          <PermissionAssignment
            roleId={role.id}
            currentPermissions={role.permissions ?? []}
          />
        </PermissionGate>
      </div>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        onConfirm={() => {
          deleteRoleMut(role.id, {
            onSuccess: () => navigate('/roles'),
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
