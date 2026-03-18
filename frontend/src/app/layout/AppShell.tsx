import { Navigate, Outlet, useLocation } from 'react-router';
import { useEffect } from 'react';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';
import { DashboardLayout } from './DashboardLayout';

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openModal = useAuthModalStore((s) => s.open);
  const location = useLocation();

  const isLanding = location.pathname === '/';
  const needsAuth = !isAuthenticated && !isLanding;

  useEffect(() => {
    if (needsAuth) {
      openModal('login');
    }
  }, [needsAuth, openModal]);

  // Landing page: visible to everyone
  if (isLanding) {
    return <Outlet />;
  }

  // All other routes require auth — redirect to landing (modal auto-opens via effect)
  if (!isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return <DashboardLayout />;
}
