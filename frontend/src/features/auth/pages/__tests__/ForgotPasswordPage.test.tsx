import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ForgotPasswordPage } from '../ForgotPasswordPage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router', () => ({
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
  forgotPassword: vi.fn(),
}));

vi.mock('@/shared/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

vi.mock('@/shared/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => (
    <div data-testid="language-switcher">LanguageSwitcher</div>
  ),
}));

import { forgotPassword } from '../../api/auth.api';

const mockedForgotPassword = vi.mocked(forgotPassword);

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

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders email input and submit button', () => {
    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    expect(
      screen.getByRole('textbox', { name: /login\.email/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'forgotPassword.submit' }),
    ).toBeInTheDocument();
  });

  it('renders the page title and subtitle', () => {
    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    expect(screen.getByText('WashFlow')).toBeInTheDocument();
    expect(screen.getByText('forgotPassword.title')).toBeInTheDocument();
    expect(screen.getByText('forgotPassword.subtitle')).toBeInTheDocument();
  });

  it('renders ThemeToggle and LanguageSwitcher', () => {
    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('"Back to login" link in form points to /login', () => {
    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    const backLink = screen.getByRole('link', {
      name: 'forgotPassword.backToLogin',
    });
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('calls forgotPassword API with entered email on submit', async () => {
    mockedForgotPassword.mockResolvedValueOnce(undefined);

    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByRole('textbox', { name: /login\.email/i }),
      'test@example.com',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'forgotPassword.submit' }),
    );

    await waitFor(() => {
      expect(mockedForgotPassword).toHaveBeenCalledWith('test@example.com');
    });
  });

  it('shows success message and hides form after submit', async () => {
    mockedForgotPassword.mockResolvedValueOnce(undefined);

    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByRole('textbox', { name: /login\.email/i }),
      'test@example.com',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'forgotPassword.submit' }),
    );

    await waitFor(() => {
      expect(screen.getByText('forgotPassword.success')).toBeInTheDocument();
    });

    expect(
      screen.queryByRole('button', { name: 'forgotPassword.submit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /login\.email/i }),
    ).not.toBeInTheDocument();
  });

  it('"Back to login" link in success view points to /login', async () => {
    mockedForgotPassword.mockResolvedValueOnce(undefined);

    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByRole('textbox', { name: /login\.email/i }),
      'test@example.com',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'forgotPassword.submit' }),
    );

    await waitFor(() => {
      expect(screen.getByText('forgotPassword.success')).toBeInTheDocument();
    });

    const backLink = screen.getByRole('link', {
      name: 'forgotPassword.backToLogin',
    });
    expect(backLink).toHaveAttribute('href', '/login');
  });

  it('shows success message even when API throws (silently handled)', async () => {
    mockedForgotPassword.mockRejectedValueOnce(new Error('Network error'));

    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByRole('textbox', { name: /login\.email/i }),
      'unknown@example.com',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'forgotPassword.submit' }),
    );

    await waitFor(() => {
      expect(screen.getByText('forgotPassword.success')).toBeInTheDocument();
    });
  });

  it('button is disabled while the request is loading', async () => {
    let resolveRequest!: () => void;
    mockedForgotPassword.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRequest = resolve;
        }),
    );

    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByRole('textbox', { name: /login\.email/i }),
      'test@example.com',
    );

    const button = screen.getByRole('button', {
      name: 'forgotPassword.submit',
    });
    await userEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'forgotPassword.loading' }),
      ).toBeDisabled();
    });

    resolveRequest();

    await waitFor(() => {
      expect(screen.getByText('forgotPassword.success')).toBeInTheDocument();
    });
  });

  it('calls forgotPassword exactly once per submit', async () => {
    mockedForgotPassword.mockResolvedValueOnce(undefined);

    render(<ForgotPasswordPage />, { wrapper: createWrapper() });

    await userEvent.type(
      screen.getByRole('textbox', { name: /login\.email/i }),
      'test@example.com',
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'forgotPassword.submit' }),
    );

    await waitFor(() => expect(mockedForgotPassword).toHaveBeenCalledTimes(1));
  });
});
