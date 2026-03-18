import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RegisterPage } from '../RegisterPage';
import { useAuthStore } from '@/shared/stores/auth.store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router', () => ({
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="navigate" data-to={to} />
  ),
  Link: ({ to, children, ...rest }: any) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../components/RegisterForm', () => ({
  RegisterForm: () => <div data-testid="register-form">RegisterForm</div>,
}));

vi.mock('@/shared/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle">ThemeToggle</div>,
}));

vi.mock('@/shared/components/LanguageSwitcher', () => ({
  LanguageSwitcher: () => (
    <div data-testid="language-switcher">LanguageSwitcher</div>
  ),
}));

const mockedUseAuthStore = vi.mocked(useAuthStore);

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the registration card when user is not authenticated', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false }),
    );

    render(<RegisterPage />);

    expect(screen.getByText('WashFlow')).toBeInTheDocument();
    expect(screen.getByText('register.title')).toBeInTheDocument();
    expect(screen.getByText('register.subtitle')).toBeInTheDocument();
  });

  it('renders the RegisterForm component', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false }),
    );

    render(<RegisterPage />);

    expect(screen.getByTestId('register-form')).toBeInTheDocument();
  });

  it('renders ThemeToggle and LanguageSwitcher', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false }),
    );

    render(<RegisterPage />);

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('renders WashFlow as a link to the root path', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false }),
    );

    render(<RegisterPage />);

    const washFlowLink = screen.getByText('WashFlow');
    expect(washFlowLink.closest('a')).toHaveAttribute('href', '/');
  });

  it('renders the "has account" text with a sign-in link', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false }),
    );

    render(<RegisterPage />);

    expect(screen.getByText('register.hasAccount')).toBeInTheDocument();

    const signInLink = screen.getByText('register.signIn');
    expect(signInLink.closest('a')).toHaveAttribute('href', '/login');
  });

  it('redirects to /dashboard when authenticated', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: true }),
    );

    render(<RegisterPage />);

    const navigate = screen.getByTestId('navigate');
    expect(navigate).toHaveAttribute('data-to', '/dashboard');
  });

  it('does not render Navigate when user is not authenticated', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: false }),
    );

    render(<RegisterPage />);

    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('does not render the registration card when user is authenticated', () => {
    mockedUseAuthStore.mockImplementation((selector: any) =>
      selector({ isAuthenticated: true }),
    );

    render(<RegisterPage />);

    expect(screen.queryByText('WashFlow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('register-form')).not.toBeInTheDocument();
  });
});
