import { type ReactNode } from 'react';
import { usePermissions } from '@/shared/hooks/usePermissions';

interface PermissionGateProps {
  permission?: string;
  permissions?: string[];
  requireAll?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}: PermissionGateProps) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  if (permission) {
    return hasPermission(permission) ? <>{children}</> : <>{fallback}</>;
  }

  if (permissions) {
    const allowed = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
    return allowed ? <>{children}</> : <>{fallback}</>;
  }

  return <>{children}</>;
}
