import { useState, useEffect } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

export function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(false);
        setMobileOpen(false);
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      {!isMobile && <Sidebar collapsed={sidebarCollapsed} mobile={false} />}

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <Sidebar
            collapsed={false}
            mobile={true}
            onClose={() => setMobileOpen(false)}
          />
        </>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuClick={() => {
            if (isMobile) {
              setMobileOpen(true);
            } else {
              setSidebarCollapsed(!sidebarCollapsed);
            }
          }}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
