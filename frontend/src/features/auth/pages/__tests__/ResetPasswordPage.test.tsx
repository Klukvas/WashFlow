import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ResetPasswordPage } from '../ResetPasswordPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const mockNavigate = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../../api/auth.api', () => ({
  resetPassword: vi.fn(),
}));

vi.mock('@/shared/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

vi.mock('@/shared/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => (
    <div data-testid="language-switcher">LanguageSwitcher</div>
  ),
}));

import { resetPassword } from '../../api/auth.api';

const mockedResetPassword = vi.mocked(resetPassword);

function setToken(token: string | null) {
  if (token) {
    mockSearchParams.set('token', token);
  } else {
    mockSearchParams.delete('token');
  }
}

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

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.delete('token');
  });

  it('renders password and confirm password inputs', () => {
    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    expect(
      screen.getByLabelText('changePassword.newPassword'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('changePassword.confirmPassword'),
    ).toBeInTheDocument();
  });

  it('renders the page title and subtitle', () => {
    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    expect(screen.getByText('WashFlow')).toBeInTheDocument();
    expect(screen.getByText('resetPasswordPage.title')).toBeInTheDocument();
    expect(screen.getByText('resetPasswordPage.subtitle')).toBeInTheDocument();
  });

  it('renders the submit button', () => {
    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    expect(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    ).toBeInTheDocument();
  });

  it('"Back to login" link points to /login', () => {
    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    const backLink = screen.getByRole('link', {
      name: 'forgotPassword.backToLogin',
    });
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('renders ThemeToggle and LanguageSwitcher', () => {
    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('shows password mismatch error and does not call API', async () => {
    setToken('valid-token');

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'password123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'different456',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    expect(
      screen.getByText('changePassword.passwordMismatch'),
    ).toBeInTheDocument();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('shows invalid token error when token is missing and does not call API', async () => {
    // No token set — searchParams is empty

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'password123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'password123',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    expect(
      screen.getByText('resetPasswordPage.invalidToken'),
    ).toBeInTheDocument();
    expect(mockedResetPassword).not.toHaveBeenCalled();
  });

  it('calls resetPassword with token and password on valid submit', async () => {
    setToken('abc123');
    mockedResetPassword.mockResolvedValueOnce(undefined);

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'newpass123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'newpass123',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    await waitFor(() => {
      expect(mockedResetPassword).toHaveBeenCalledWith('abc123', 'newpass123');
    });
  });

  it('navigates to /login after successful reset', async () => {
    setToken('abc123');
    mockedResetPassword.mockResolvedValueOnce(undefined);

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'newpass123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'newpass123',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/login', {
        state: { passwordReset: true },
      });
    });
  });

  it('shows API error message when resetPassword throws', async () => {
    setToken('abc123');
    mockedResetPassword.mockRejectedValueOnce(new Error('Token expired'));

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'newpass123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'newpass123',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    await waitFor(() => {
      expect(screen.getByText('resetPasswordPage.error')).toBeInTheDocument();
    });

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('button is disabled while the request is loading', async () => {
    setToken('abc123');

    let resolveRequest!: () => void;
    mockedResetPassword.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'newpass123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'newpass123',
    );

    const button = screen.getByRole('button', {
      name: 'resetPasswordPage.submit',
    });
    await userEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'resetPasswordPage.loading' }),
      ).toBeDisabled();
    });

    resolveRequest();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it('clears error state on a new submission attempt', async () => {
    setToken('abc123');
    mockedResetPassword.mockRejectedValueOnce(new Error('Token expired'));

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'newpass123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'newpass123',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    await waitFor(() => {
      expect(screen.getByText('resetPasswordPage.error')).toBeInTheDocument();
    });

    // Submit again — error should clear before the new attempt resolves
    mockedResetPassword.mockResolvedValueOnce(undefined);
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    await waitFor(() => {
      expect(
        screen.queryByText('resetPasswordPage.error'),
      ).not.toBeInTheDocument();
    });
  });

  it('does not navigate when passwords mismatch', async () => {
    setToken('abc123');

    render(<ResetPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByLabelText('changePassword.newPassword'),
      'password123',
    );
    await userEvent.type(
      screen.getByLabelText('changePassword.confirmPassword'),
      'different456',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'resetPasswordPage.submit' }),
    );

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
