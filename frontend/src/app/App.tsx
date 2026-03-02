import { RouterProvider } from 'react-router';
import { router } from './router';
import { Providers } from './providers';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { useSocket } from '@/shared/hooks/useSocket';

function AppInner() {
  useSocket();
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
