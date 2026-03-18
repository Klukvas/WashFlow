import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CheckoutButton } from '../CheckoutButton';

const mockMutateAsync = vi.fn();
const mockIsPending = { current: false };

vi.mock('../../hooks/useSubscription', () => ({
  useCreateCheckout: () => ({
    mutateAsync: mockMutateAsync,
    get isPending() {
      return mockIsPending.current;
    },
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'checkout.subscribe': 'Subscribe',
      };
      return translations[key] ?? key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

const mockInitializePaddle = vi.fn();
vi.mock('@paddle/paddle-js', () => ({
  initializePaddle: (...args: unknown[]) => mockInitializePaddle(...args),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe('CheckoutButton', () => {
  const defaultProps = {
    planTier: 'STARTER' as const,
    billingInterval: 'MONTHLY' as const,
    clientToken: 'test-token',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPending.current = false;
    mockMutateAsync.mockResolvedValue({
      transactionId: 'txn-1',
      clientToken: 'tok-1',
    });
    mockInitializePaddle.mockResolvedValue({
      Checkout: { open: vi.fn() },
    });
  });

  it('renders default "Subscribe" text', () => {
    render(<CheckoutButton {...defaultProps} />, { wrapper: createWrapper() });

    expect(
      screen.getByRole('button', { name: 'Subscribe' }),
    ).toBeInTheDocument();
  });

  it('renders custom children', () => {
    render(<CheckoutButton {...defaultProps}>Get Started</CheckoutButton>, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByRole('button', { name: 'Get Started' }),
    ).toBeInTheDocument();
  });

  it('initializes Paddle SDK with sandbox environment when sandbox prop is true', () => {
    render(<CheckoutButton {...defaultProps} sandbox={true} />, {
      wrapper: createWrapper(),
    });

    expect(mockInitializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({
        token: 'test-token',
        environment: 'sandbox',
      }),
    );
  });

  it('initializes Paddle SDK with production environment when sandbox is false', () => {
    render(<CheckoutButton {...defaultProps} sandbox={false} />, {
      wrapper: createWrapper(),
    });

    expect(mockInitializePaddle).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'production',
      }),
    );
  });

  it('calls mutateAsync with tier and interval on click', async () => {
    render(<CheckoutButton {...defaultProps} />, { wrapper: createWrapper() });

    await userEvent.click(screen.getByRole('button'));

    expect(mockMutateAsync).toHaveBeenCalledWith({
      planTier: 'STARTER',
      billingInterval: 'MONTHLY',
    });
  });

  it('opens Paddle checkout after successful mutation', async () => {
    const mockOpen = vi.fn();
    mockInitializePaddle.mockResolvedValue({
      Checkout: { open: mockOpen },
    });

    render(<CheckoutButton {...defaultProps} />, { wrapper: createWrapper() });

    // Wait for Paddle initialization
    await vi.waitFor(() => {
      expect(mockInitializePaddle).toHaveBeenCalled();
    });

    await userEvent.click(screen.getByRole('button'));

    // Give the async flow time to resolve
    await vi.waitFor(() => {
      expect(mockOpen).toHaveBeenCalledWith({
        transactionId: 'txn-1',
      });
    });
  });

  it('disables button when isPending', () => {
    mockIsPending.current = true;
    render(<CheckoutButton {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('does not initialize Paddle when clientToken is empty', () => {
    render(<CheckoutButton {...defaultProps} clientToken="" />, {
      wrapper: createWrapper(),
    });

    expect(mockInitializePaddle).not.toHaveBeenCalled();
  });
});
