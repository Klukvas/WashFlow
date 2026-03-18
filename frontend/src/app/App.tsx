import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './router';
import { Providers } from './providers';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAuthStore } from '@/shared/stores/auth.store';
import { Skeleton } from '@/shared/ui/skeleton';

function AppInner() {
  useSocket();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Proactively refresh the access token on boot so it's available
    // before any API call fires.  Prevents a race with the 401 interceptor.
    useAuthStore
      .getState()
      .bootRefresh()
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Providers>
        <AppInner />
      </Providers>
    </ErrorBoundary>
  );
}
