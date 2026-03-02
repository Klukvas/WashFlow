import { useCallback, useMemo } from 'react';
import { useAuthStore, decodeJwtPayload } from '@/shared/stores/auth.store';

export function usePermissions() {
  const { permissions, accessToken } = useAuthStore();

  const isSuperAdmin = useMemo(() => {
    if (!accessToken) return false;
    return decodeJwtPayload(accessToken).isSuperAdmin ?? false;
  }, [accessToken]);

  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (isSuperAdmin) return true;
      return permissions.includes(permission);
    },
    [isSuperAdmin, permissions],
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (isSuperAdmin) return true;
      return perms.some((p) => permissions.includes(p));
    },
    [isSuperAdmin, permissions],
  );

  const hasAllPermissions = useCallback(
    (perms: string[]): boolean => {
      if (isSuperAdmin) return true;
      return perms.every((p) => permissions.includes(p));
    },
    [isSuperAdmin, permissions],
  );

  return { hasPermission, hasAnyPermission, hasAllPermissions, isSuperAdmin };
}
