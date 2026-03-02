import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Save } from 'lucide-react';
import { usePermissionsList, useAssignPermissions } from '../hooks/useRoles';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import type { Permission } from '@/shared/types/models';

interface PermissionAssignmentProps {
  roleId: string;
  currentPermissions: Permission[];
}

interface PermissionGroup {
  module: string;
  permissions: Permission[];
}

function groupPermissionsByModule(permissions: Permission[]): PermissionGroup[] {
  const grouped = permissions.reduce<Record<string, Permission[]>>(
    (acc, permission) => {
      const { module } = permission;
      if (!acc[module]) {
        acc[module] = [];
      }
      acc[module].push(permission);
      return acc;
    },
    {},
  );

  return Object.entries(grouped)
    .map(([module, perms]) => ({
      module,
      permissions: perms.sort((a, b) => a.action.localeCompare(b.action)),
    }))
    .sort((a, b) => a.module.localeCompare(b.module));
}

export function PermissionAssignment({
  roleId,
  currentPermissions,
}: PermissionAssignmentProps) {
  const { t } = useTranslation('roles');
  const { t: tc } = useTranslation('common');
  const { data: allPermissions, isLoading } = usePermissionsList();
  const { mutate: assign, isPending } = useAssignPermissions();

  const currentIds = useMemo(
    () => new Set(currentPermissions.map((p) => p.id)),
    [currentPermissions],
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds(new Set(currentIds));
  }, [currentIds]);

  const groups = useMemo(
    () => groupPermissionsByModule(allPermissions ?? []),
    [allPermissions],
  );

  const isDirty = useMemo(() => {
    if (selectedIds.size !== currentIds.size) return true;
    for (const id of selectedIds) {
      if (!currentIds.has(id)) return true;
    }
    return false;
  }, [selectedIds, currentIds]);

  const handleToggle = useCallback((permissionId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  }, []);

  const handleToggleModule = useCallback(
    (permissions: Permission[]) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        const allSelected = permissions.every((p) => next.has(p.id));

        if (allSelected) {
          permissions.forEach((p) => next.delete(p.id));
        } else {
          permissions.forEach((p) => next.add(p.id));
        }

        return next;
      });
    },
    [],
  );

  const handleSave = () => {
    assign({
      id: roleId,
      permissionIds: Array.from(selectedIds),
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!allPermissions?.length) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        {t('permissions.noPermissions')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('permissions.title')}</h3>
        </div>
        <Button onClick={handleSave} loading={isPending} disabled={!isDirty}>
          <Save className="h-4 w-4" />
          {tc('actions.save')}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        {t('permissions.description', {
          selected: selectedIds.size,
          total: allPermissions.length,
        })}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {groups.map(({ module, permissions }) => {
          const allChecked = permissions.every((p) => selectedIds.has(p.id));
          const someChecked =
            !allChecked && permissions.some((p) => selectedIds.has(p.id));

          return (
            <Card key={module}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = someChecked;
                    }}
                    onChange={() => handleToggleModule(permissions)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <CardTitle className="text-base capitalize">
                    {t(`permissions.modules.${module}`, { defaultValue: module })}
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {permissions.map((permission) => (
                    <label
                      key={permission.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(permission.id)}
                        onChange={() => handleToggle(permission.id)}
                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                      />
                      <div className="flex-1">
                        <span className="font-medium">
                          {t(`permissions.actions.${permission.action}`, {
                            defaultValue: permission.action,
                          })}
                        </span>
                        {permission.description && (
                          <p className="text-xs text-muted-foreground">
                            {permission.description}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
