import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { DashboardLayout } from './layout/DashboardLayout';
import { PublicLayout } from './layout/PublicLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RequireAuth } from '@/shared/components/RequireAuth';
import { Skeleton } from '@/shared/ui/skeleton';

// Lazy-loaded feature pages
const DashboardPage = lazy(() =>
  import('@/features/dashboard/pages/DashboardPage').then((m) => ({
    default: m.DashboardPage,
  })),
);
const OrdersPage = lazy(() =>
  import('@/features/orders/pages/OrdersPage').then((m) => ({
    default: m.OrdersPage,
  })),
);
const OrderDetailPage = lazy(() =>
  import('@/features/orders/pages/OrderDetailPage').then((m) => ({
    default: m.OrderDetailPage,
  })),
);
const CreateOrderPage = lazy(() =>
  import('@/features/orders/pages/CreateOrderPage').then((m) => ({
    default: m.CreateOrderPage,
  })),
);
const ClientsPage = lazy(() =>
  import('@/features/clients/pages/ClientsPage').then((m) => ({
    default: m.ClientsPage,
  })),
);
const ClientDetailPage = lazy(() =>
  import('@/features/clients/pages/ClientDetailPage').then((m) => ({
    default: m.ClientDetailPage,
  })),
);
const VehiclesPage = lazy(() =>
  import('@/features/vehicles/pages/VehiclesPage').then((m) => ({
    default: m.VehiclesPage,
  })),
);
const ServicesPage = lazy(() =>
  import('@/features/services/pages/ServicesPage').then((m) => ({
    default: m.ServicesPage,
  })),
);
const BranchesPage = lazy(() =>
  import('@/features/branches/pages/BranchesPage').then((m) => ({
    default: m.BranchesPage,
  })),
);
const BranchDetailPage = lazy(() =>
  import('@/features/branches/pages/BranchDetailPage').then((m) => ({
    default: m.BranchDetailPage,
  })),
);
const WorkPostsPage = lazy(() =>
  import('@/features/work-posts/pages/WorkPostsPage').then((m) => ({
    default: m.WorkPostsPage,
  })),
);
const UsersPage = lazy(() =>
  import('@/features/users/pages/UsersPage').then((m) => ({
    default: m.UsersPage,
  })),
);
const RolesPage = lazy(() =>
  import('@/features/roles/pages/RolesPage').then((m) => ({
    default: m.RolesPage,
  })),
);
const RoleDetailPage = lazy(() =>
  import('@/features/roles/pages/RoleDetailPage').then((m) => ({
    default: m.RoleDetailPage,
  })),
);
const AnalyticsPage = lazy(() =>
  import('@/features/analytics/pages/AnalyticsPage').then((m) => ({
    default: m.AnalyticsPage,
  })),
);
const AuditPage = lazy(() =>
  import('@/features/audit/pages/AuditPage').then((m) => ({
    default: m.AuditPage,
  })),
);
const WorkforcePage = lazy(() =>
  import('@/features/workforce/pages/WorkforcePage').then((m) => ({
    default: m.WorkforcePage,
  })),
);
const PublicLandingPage = lazy(() =>
  import('@/features/public-booking/pages/PublicLandingPage').then((m) => ({
    default: m.PublicLandingPage,
  })),
);
const PublicBookingPage = lazy(() =>
  import('@/features/public-booking/pages/PublicBookingPage').then((m) => ({
    default: m.PublicBookingPage,
  })),
);
const HowToLayout = lazy(() =>
  import('@/features/how-to/pages/HowToLayout').then((m) => ({
    default: m.HowToLayout,
  })),
);
const HowToTopicPage = lazy(() =>
  import('@/features/how-to/pages/HowToTopicPage').then((m) => ({
    default: m.HowToTopicPage,
  })),
);

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/public/:slug',
    element: <PublicLayout />,
    children: [
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <PublicLandingPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'book',
        element: (
          <SuspenseWrapper>
            <PublicBookingPage />
          </SuspenseWrapper>
        ),
      },
    ],
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <DashboardLayout />
      </RequireAuth>
    ),
    children: [
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <DashboardPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'orders',
        element: (
          <SuspenseWrapper>
            <OrdersPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'orders/create',
        element: (
          <SuspenseWrapper>
            <CreateOrderPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'orders/:id',
        element: (
          <SuspenseWrapper>
            <OrderDetailPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'clients',
        element: (
          <SuspenseWrapper>
            <ClientsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'clients/:id',
        element: (
          <SuspenseWrapper>
            <ClientDetailPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'vehicles',
        element: (
          <SuspenseWrapper>
            <VehiclesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'services',
        element: (
          <SuspenseWrapper>
            <ServicesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'branches',
        element: (
          <SuspenseWrapper>
            <BranchesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'branches/:id',
        element: (
          <SuspenseWrapper>
            <BranchDetailPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'work-posts',
        element: (
          <SuspenseWrapper>
            <WorkPostsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'users',
        element: (
          <SuspenseWrapper>
            <UsersPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'roles',
        element: (
          <SuspenseWrapper>
            <RolesPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'roles/:id',
        element: (
          <SuspenseWrapper>
            <RoleDetailPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'analytics',
        element: (
          <SuspenseWrapper>
            <AnalyticsPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'audit',
        element: (
          <SuspenseWrapper>
            <AuditPage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'workforce',
        element: (
          <SuspenseWrapper>
            <WorkforcePage />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'how-to',
        element: (
          <SuspenseWrapper>
            <HowToLayout />
          </SuspenseWrapper>
        ),
        children: [
          {
            index: true,
            element: <Navigate to="/how-to/getting-started" replace />,
          },
          {
            path: ':topicSlug',
            element: (
              <SuspenseWrapper>
                <HowToTopicPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
      {
        path: '403',
        element: <ForbiddenPage />,
      },
      {
        path: '404',
        element: <NotFoundPage />,
      },
      {
        path: '*',
        element: <Navigate to="/404" replace />,
      },
    ],
  },
]);
