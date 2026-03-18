import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StepReview } from '../StepReview';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/utils/format', () => ({
  formatCurrency: (v: number) => `$${v}`,
  formatDateTime: (v: string) => `dt:${v}`,
  formatDuration: (v: number) => `${v}m`,
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
    loading,
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled || loading} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: React.ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={placeholder}
    />
  ),
}));

vi.mock('@/shared/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/shared/ui/card', () => ({
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

const fakeBranches = [{ id: 'b1', name: 'Main Branch' }];

const fakeServices = [
  { id: 's1', name: 'Wash', durationMin: 30, price: '100', isActive: true },
  { id: 's2', name: 'Polish', durationMin: 60, price: '200', isActive: true },
];

const fakeWorkPosts = [{ id: 'wp1', name: 'Bay 1' }];

vi.mock('@/features/branches/hooks/useBranches', () => ({
  useBranches: () => ({
    data: {
      items: fakeBranches,
      meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/services/hooks/useServices', () => ({
  useServices: () => ({
    data: {
      items: fakeServices,
      meta: { total: 2, page: 1, limit: 100, totalPages: 1 },
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/work-posts/hooks/useWorkPosts', () => ({
  useWorkPosts: () => ({
    data: {
      items: fakeWorkPosts,
      meta: { total: 1, page: 1, limit: 50, totalPages: 1 },
    },
    isLoading: false,
  }),
}));

vi.mock('@/features/workforce/api/workforce.api', () => ({
  fetchProfiles: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'w1',
        isWorker: true,
        user: { firstName: 'John', lastName: 'Doe' },
      },
    ],
    meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
  }),
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

describe('StepReview', () => {
  const defaultProps = {
    branchId: 'b1',
    clientName: 'Alice Johnson',
    vehiclePlate: 'AA1234BB',
    assignedEmployeeId: undefined as string | undefined,
    scheduledStart: '2026-03-18T10:00:00Z',
    workPostId: 'wp1' as string | undefined,
    serviceIds: ['s1', 's2'],
    notes: '',
    onNotesChange: vi.fn(),
    onBack: vi.fn(),
    onConfirm: vi.fn(),
    isPending: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the step title', () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.review')).toBeInTheDocument();
  });

  it('displays client name', () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  it('displays vehicle plate', () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('AA1234BB')).toBeInTheDocument();
  });

  it('displays scheduled start formatted', () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('dt:2026-03-18T10:00:00Z')).toBeInTheDocument();
  });

  it('displays "Any Worker" when no employee assigned', () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.anyWorker')).toBeInTheDocument();
  });

  it('displays assigned worker name', async () => {
    render(<StepReview {...defaultProps} assignedEmployeeId="w1" />, {
      wrapper: createWrapper(),
    });

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
  });

  it('displays services with prices', async () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(await screen.findByText('Wash')).toBeInTheDocument();
    expect(screen.getByText('Polish')).toBeInTheDocument();
    expect(screen.getByText('$100')).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
  });

  it('displays total amount', async () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    await screen.findByText('Wash');
    expect(screen.getByText('$300')).toBeInTheDocument();
  });

  it('renders notes input', () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByPlaceholderText('fields.notes')).toBeInTheDocument();
  });

  it('calls onNotesChange when typing in notes', () => {
    const onNotesChange = vi.fn();
    render(<StepReview {...defaultProps} onNotesChange={onNotesChange} />, {
      wrapper: createWrapper(),
    });

    fireEvent.change(screen.getByPlaceholderText('fields.notes'), {
      target: { value: 'Please hurry' },
    });
    expect(onNotesChange).toHaveBeenCalledWith('Please hurry');
  });

  it('calls onConfirm when clicking confirm button', () => {
    const onConfirm = vi.fn();
    render(<StepReview {...defaultProps} onConfirm={onConfirm} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('creation.confirmBooking'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('disables confirm button when isPending', () => {
    render(<StepReview {...defaultProps} isPending={true} />, {
      wrapper: createWrapper(),
    });

    const confirmBtn = screen.getByText('creation.confirmBooking');
    expect(confirmBtn).toBeDisabled();
  });

  it('calls onBack when clicking Back', () => {
    const onBack = vi.fn();
    render(<StepReview {...defaultProps} onBack={onBack} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('displays branch name from query', async () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(await screen.findByText('Main Branch')).toBeInTheDocument();
  });

  it('displays work post name from query', async () => {
    render(<StepReview {...defaultProps} />, { wrapper: createWrapper() });

    expect(await screen.findByText('Bay 1')).toBeInTheDocument();
  });

  it('shows dash when no work post is assigned', () => {
    render(<StepReview {...defaultProps} workPostId={undefined} />, {
      wrapper: createWrapper(),
    });

    // "—" is rendered when no work post is found
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
