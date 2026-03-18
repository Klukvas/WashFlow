import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StepBranchClient } from '../StepBranchClient';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    size,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
    size?: string;
    [key: string]: unknown;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
    ...props
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    [key: string]: unknown;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder}
      {...(props as React.InputHTMLAttributes<HTMLInputElement>)}
    />
  ),
}));

vi.mock('@/shared/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/shared/ui/select', () => ({
  Select: ({
    options,
    value,
    onChange,
    placeholder,
    error,
  }: {
    options?: { value: string; label: string }[];
    value: string;
    onChange: React.ChangeEventHandler<HTMLSelectElement>;
    placeholder?: string;
    error?: string;
  }) => (
    <div>
      <select
        data-testid="branch-select"
        value={value}
        onChange={onChange}
        aria-label={placeholder}
      >
        <option value="">{placeholder}</option>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && <span data-testid="error">{error}</span>}
    </div>
  ),
}));

vi.mock('@/shared/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('lucide-react', () => ({
  Plus: () => <span data-testid="plus-icon" />,
}));

vi.mock('@/features/clients/hooks/useClients', () => ({
  useCreateClient: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/features/clients/components/ClientForm', () => ({
  ClientForm: ({
    onSubmit,
    onCancel,
  }: {
    onSubmit: (data: { firstName: string; phone: string }) => void;
    onCancel: () => void;
  }) => (
    <div data-testid="client-form">
      <button onClick={() => onSubmit({ firstName: 'New', phone: '123' })}>
        submit-client
      </button>
      <button onClick={onCancel}>cancel-client</button>
    </div>
  ),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: 'c1',
            firstName: 'Alice',
            lastName: 'Johnson',
            phone: '+380501111111',
          },
          {
            id: 'c2',
            firstName: 'Bob',
            lastName: 'Brown',
            phone: '+380502222222',
          },
        ],
        meta: { total: 2, page: 1, limit: 10, totalPages: 1 },
      },
    }),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

const fakeBranches = [
  { id: 'b1', name: 'Branch One' },
  { id: 'b2', name: 'Branch Two' },
] as { id: string; name: string }[];

describe('StepBranchClient', () => {
  const defaultProps = {
    branchId: '',
    clientId: '',
    branches: fakeBranches,
    onBranchChange: vi.fn(),
    onClientChange: vi.fn(),
    onNext: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders branch selector', () => {
    render(<StepBranchClient {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('branch-select')).toBeInTheDocument();
  });

  it('renders client search input', () => {
    render(<StepBranchClient {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByPlaceholderText('creation.searchClient'),
    ).toBeInTheDocument();
  });

  it('calls onBranchChange when selecting a branch', () => {
    const onBranchChange = vi.fn();
    render(
      <StepBranchClient {...defaultProps} onBranchChange={onBranchChange} />,
      { wrapper: createWrapper() },
    );

    fireEvent.change(screen.getByTestId('branch-select'), {
      target: { value: 'b1' },
    });
    expect(onBranchChange).toHaveBeenCalledWith('b1');
  });

  it('disables Next when branchId or clientId is empty', () => {
    render(<StepBranchClient {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).toBeDisabled();
  });

  it('disables Next when only branchId is set', () => {
    render(<StepBranchClient {...defaultProps} branchId="b1" />, {
      wrapper: createWrapper(),
    });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next when branchId and clientId are set', () => {
    render(<StepBranchClient {...defaultProps} branchId="b1" clientId="c1" />, {
      wrapper: createWrapper(),
    });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onNext when clicking Next', () => {
    const onNext = vi.fn();
    render(
      <StepBranchClient
        {...defaultProps}
        branchId="b1"
        clientId="c1"
        onNext={onNext}
      />,
      { wrapper: createWrapper() },
    );

    fireEvent.click(screen.getByText('actions.next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('shows create client button', () => {
    render(<StepBranchClient {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/actions.create/)).toBeInTheDocument();
  });

  it('opens client dialog when clicking create button', () => {
    render(<StepBranchClient {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    // Dialog should not be visible initially
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();

    // Click the create button
    const createBtns = screen.getAllByText(/actions.create/);
    fireEvent.click(createBtns[0]);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('hides branch selector when hideBranchSelector is true', () => {
    render(<StepBranchClient {...defaultProps} hideBranchSelector />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByTestId('branch-select')).not.toBeInTheDocument();
  });

  it('shows branch error', () => {
    render(<StepBranchClient {...defaultProps} branchError="Required" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('error')).toHaveTextContent('Required');
  });

  it('shows client list when search has results and no client selected', async () => {
    const user = userEvent.setup();
    render(<StepBranchClient {...defaultProps} />, {
      wrapper: createWrapper(),
    });

    const searchInput = screen.getByPlaceholderText('creation.searchClient');
    await user.type(searchInput, 'Ali');

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });
  });

  it('calls onClientChange when selecting a client from list', async () => {
    const user = userEvent.setup();
    const onClientChange = vi.fn();
    render(
      <StepBranchClient {...defaultProps} onClientChange={onClientChange} />,
      { wrapper: createWrapper() },
    );

    const searchInput = screen.getByPlaceholderText('creation.searchClient');
    await user.type(searchInput, 'Ali');

    await waitFor(() => {
      expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Alice Johnson'));
    expect(onClientChange).toHaveBeenCalledWith('c1', 'Alice Johnson');
  });
});
