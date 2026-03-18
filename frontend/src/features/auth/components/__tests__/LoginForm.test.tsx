import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LoginForm } from '../LoginForm';

const mockMutate = vi.fn();
let mockIsPending = false;
let mockError: Error | null = null;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: (selector: (state: any) => unknown) =>
    selector({ setAuth: vi.fn() }),
}));

vi.mock('../../hooks/useLogin', () => ({
  useLogin: () => ({
    mutate: mockMutate,
    isPending: mockIsPending,
    error: mockError,
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
    mockError = null;
  });

  it('renders email and password fields', () => {
    render(<LoginForm />, { wrapper: createWrapper() });

    expect(screen.getByLabelText('login.email')).toBeInTheDocument();
    expect(screen.getByLabelText('login.password')).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  it('calls mutate with form data on valid submit', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('login.email'), 'test@example.com');
    await user.type(screen.getByLabelText('login.password'), 'password123');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('shows loading text when isPending is true', () => {
    mockIsPending = true;
    render(<LoginForm />, { wrapper: createWrapper() });

    expect(screen.getByTestId('login-submit')).toHaveTextContent('login.loading');
  });

  it('shows error message when login fails', () => {
    mockError = new Error('bad');
    render(<LoginForm />, { wrapper: createWrapper() });

    expect(screen.getByText('login.error')).toBeInTheDocument();
  });

  it('shows forgot password link', () => {
    render(<LoginForm />, { wrapper: createWrapper() });

    const link = screen.getByText('login.forgotPassword');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/forgot-password');
  });

  it('email field validates format', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('login.email'), 'not-an-email');
    await user.type(screen.getByLabelText('login.password'), 'password123');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  it('password requires min 8 chars', async () => {
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('login.email'), 'test@example.com');
    await user.type(screen.getByLabelText('login.password'), 'short');
    await user.click(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });
});
