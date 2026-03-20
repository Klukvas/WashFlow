import { useCallback, useMemo } from 'react';
import {
  useAuthStore,
  decodeJwtPayload,
  getAccessToken,
} from '@/shared/stores/auth.store';

export function usePermissions() {
  const permissions = useAuthStore((s) => s.permissions);

  const isSuperAdmin = useMemo(() => {
    const token = getAccessToken();
    if (!token) return false;
    return decodeJwtPayload(token).isSuperAdmin ?? false;
  }, [permissions]);

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
