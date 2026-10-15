import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from 'sonner';
import { queryClient } from '@/shared/api/query-client';
import i18n from '@/i18n';

// eslint-disable-next-line react-refresh/only-export-components
export { queryClient };

export function Providers({ children }: { children: ReactNode }) {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          {children}
          <Toaster richColors position="top-right" closeButton />
        </I18nextProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}
