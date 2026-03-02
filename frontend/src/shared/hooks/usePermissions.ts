import { useAuthStore } from '@/shared/stores/auth.store';

export function usePermissions() {
  const { permissions, user } = useAuthStore();
  const isSuperAdmin = user?.isSuperAdmin ?? false;

  function hasPermission(permission: string): boolean {
    if (isSuperAdmin) return true;
    return permissions.includes(permission);
  }

  function hasAnyPermission(perms: string[]): boolean {
    if (isSuperAdmin) return true;
    return perms.some((p) => permissions.includes(p));
  }

  function hasAllPermissions(perms: string[]): boolean {
    if (isSuperAdmin) return true;
    return perms.every((p) => permissions.includes(p));
  }

  return { hasPermission, hasAnyPermission, hasAllPermissions, isSuperAdmin };
}
