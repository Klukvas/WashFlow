import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoginPage } from '../LoginPage';
import { useAuthStore } from '@/shared/stores/auth.store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

type LocationState = { state: { from?: string } | null; pathname: string };
const mockUseLocation = vi.fn(() => ({
  state: null as LocationState['state'],
  pathname: '/login',
}));

vi.mock('react-router', () => ({
  Navigate: ({ to }: { to: string }) => (
    <div data-testid="navigate" data-to={to} />
  ),
  useLocation: () => mockUseLocation(),
}));

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../../components/LoginForm', () => ({
  LoginForm: () => <div data-testid="login-form">LoginForm</div>,
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

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLocation.mockReturnValue({ state: null, pathname: '/login' });
  });

  it('renders the login card when user is not authenticated', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: false }),
    );

    render(<LoginPage />);

    expect(screen.getByText('WashFlow')).toBeInTheDocument();
    expect(screen.getByText('login.title')).toBeInTheDocument();
    expect(screen.getByText('login.subtitle')).toBeInTheDocument();
  });

  it('renders the LoginForm component', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: false }),
    );

    render(<LoginPage />);

    expect(screen.getByTestId('login-form')).toBeInTheDocument();
  });

  it('renders ThemeToggle and LanguageSwitcher', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: false }),
    );

    render(<LoginPage />);

    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
  });

  it('redirects to /dashboard when authenticated and no "from" state', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: true }),
    );

    render(<LoginPage />);

    const navigate = screen.getByTestId('navigate');
    expect(navigate).toHaveAttribute('data-to', '/dashboard');
  });

  it('redirects to the "from" location when authenticated with state', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: true }),
    );
    mockUseLocation.mockReturnValue({
      state: { from: '/orders' },
      pathname: '/login',
    });

    render(<LoginPage />);

    const navigate = screen.getByTestId('navigate');
    expect(navigate).toHaveAttribute('data-to', '/orders');
  });

  it('does not render Navigate when user is not authenticated', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: false }),
    );

    render(<LoginPage />);

    expect(screen.queryByTestId('navigate')).not.toBeInTheDocument();
  });

  it('does not render the login card when user is authenticated', () => {
    mockedUseAuthStore.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (selector: any) => selector({ isAuthenticated: true }),
    );

    render(<LoginPage />);

    expect(screen.queryByText('WashFlow')).not.toBeInTheDocument();
    expect(screen.queryByTestId('login-form')).not.toBeInTheDocument();
  });
});
