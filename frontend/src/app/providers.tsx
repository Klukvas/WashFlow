import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HelmetProvider } from 'react-helmet-async';
import { I18nextProvider } from 'react-i18next';
import { Toaster, toast } from 'sonner';
import type { AxiosError } from 'axios';
import type { ApiError } from '@/shared/types/api';
import i18n from '@/i18n';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      onError: (error) => {
        const axiosError = error as AxiosError<ApiError>;
        const status = axiosError.response?.status;

        // For auth endpoints (401/403) surface a generic message so we don't
        // leak internal error details (e.g. "Invalid credentials" vs "User not found").
        if (status === 401 || status === 403) {
          toast.error('Authentication failed. Please check your credentials.');
          return;
        }

        const raw = axiosError.response?.data?.message;
        const message = Array.isArray(raw)
          ? raw.join(', ')
          : (raw ?? 'Something went wrong');
        toast.error(message);
      },
    },
  },
});

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
