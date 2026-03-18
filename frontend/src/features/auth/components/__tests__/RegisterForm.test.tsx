import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { RegisterForm } from '../RegisterForm';

const mockMutate = vi.fn();
let mockIsPending = false;
let mockError: { response?: { status: number } } | Error | null = null;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/shared/stores/auth.store', () => ({
  useAuthStore: (
    selector: (state: { setAuth: ReturnType<typeof vi.fn> }) => unknown,
  ) => selector({ setAuth: vi.fn() }),
}));

vi.mock('../../hooks/useRegister', () => ({
  useRegister: () => ({
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

describe('RegisterForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending = false;
    mockError = null;
  });

  it('renders all 6 fields', () => {
    render(<RegisterForm />, { wrapper: createWrapper() });

    expect(screen.getByLabelText('register.companyName')).toBeInTheDocument();
    expect(screen.getByLabelText('register.firstName')).toBeInTheDocument();
    expect(screen.getByLabelText('register.lastName')).toBeInTheDocument();
    expect(screen.getByLabelText('register.email')).toBeInTheDocument();
    expect(screen.getByLabelText('register.password')).toBeInTheDocument();
    expect(
      screen.getByLabelText('register.confirmPassword'),
    ).toBeInTheDocument();
  });

  it('shows validation errors on empty submit', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: createWrapper() });

    await user.click(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  it('detects password mismatch', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('register.companyName'), 'WashCo');
    await user.type(screen.getByLabelText('register.firstName'), 'John');
    await user.type(screen.getByLabelText('register.lastName'), 'Doe');
    await user.type(
      screen.getByLabelText('register.email'),
      'john@example.com',
    );
    await user.type(screen.getByLabelText('register.password'), 'password123');
    await user.type(
      screen.getByLabelText('register.confirmPassword'),
      'differentpwd',
    );
    await user.click(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });

  it('calls mutate with payload excluding confirmPassword', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: createWrapper() });

    await user.type(screen.getByLabelText('register.companyName'), 'WashCo');
    await user.type(screen.getByLabelText('register.firstName'), 'John');
    await user.type(screen.getByLabelText('register.lastName'), 'Doe');
    await user.type(
      screen.getByLabelText('register.email'),
      'john@example.com',
    );
    await user.type(screen.getByLabelText('register.password'), 'password123');
    await user.type(
      screen.getByLabelText('register.confirmPassword'),
      'password123',
    );
    await user.click(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith({
        companyName: 'WashCo',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'password123',
      });
    });
  });

  it('shows loading text when isPending', () => {
    mockIsPending = true;
    render(<RegisterForm />, { wrapper: createWrapper() });

    expect(screen.getByTestId('register-submit')).toHaveTextContent(
      'register.loading',
    );
  });

  it('shows generic error on failure', () => {
    mockError = new Error('something went wrong');
    render(<RegisterForm />, { wrapper: createWrapper() });

    expect(screen.getByText('register.error')).toBeInTheDocument();
  });

  it('shows "email in use" for 409 conflict error', () => {
    mockError = { response: { status: 409 } };
    render(<RegisterForm />, { wrapper: createWrapper() });

    expect(screen.getByText('register.emailInUse')).toBeInTheDocument();
  });

  it('all fields are required', async () => {
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: createWrapper() });

    // Fill only some fields
    await user.type(screen.getByLabelText('register.companyName'), 'WashCo');
    await user.click(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalled();
    });
  });
});
