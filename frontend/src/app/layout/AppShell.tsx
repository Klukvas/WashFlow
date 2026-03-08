import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '@/shared/stores/auth.store';
import { DashboardLayout } from './DashboardLayout';

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();

  // Landing page: visible to everyone
  if (location.pathname === '/') {
    return <Outlet />;
  }

  // All other routes require auth
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <DashboardLayout />;
}
