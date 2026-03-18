import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StepWorker } from '../StepWorker';

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
    ...props
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    [key: string]: unknown;
  }) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/card', () => ({
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon" />,
}));

vi.mock('@/features/workforce/api/workforce.api', () => ({
  fetchProfiles: vi.fn().mockResolvedValue({
    items: [
      {
        id: 'w1',
        isWorker: true,
        user: { firstName: 'John', lastName: 'Doe' },
        workStartTime: '09:00',
        workEndTime: '17:00',
      },
      {
        id: 'w2',
        isWorker: true,
        user: { firstName: 'Jane', lastName: 'Smith' },
        workStartTime: '10:00',
        workEndTime: '18:00',
      },
      {
        id: 'w3',
        isWorker: false,
        user: { firstName: 'Admin', lastName: 'User' },
        workStartTime: null,
        workEndTime: null,
      },
    ],
    meta: { total: 3, page: 1, limit: 100, totalPages: 1 },
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

describe('StepWorker', () => {
  const defaultProps = {
    branchId: 'b1',
    assignedEmployeeId: undefined as string | undefined,
    onWorkerChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the step title', () => {
    render(<StepWorker {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.selectWorker')).toBeInTheDocument();
  });

  it('renders "Any Worker" option', () => {
    render(<StepWorker {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.anyWorker')).toBeInTheDocument();
  });

  it('renders worker list (only isWorker=true)', async () => {
    render(<StepWorker {...defaultProps} />, { wrapper: createWrapper() });

    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    // Admin User should NOT appear (isWorker: false)
    expect(screen.queryByText('Admin User')).not.toBeInTheDocument();
  });

  it('shows work hours for workers', async () => {
    render(<StepWorker {...defaultProps} />, { wrapper: createWrapper() });

    await screen.findByText('John Doe');
    expect(screen.getByText('09:00 – 17:00')).toBeInTheDocument();
    expect(screen.getByText('10:00 – 18:00')).toBeInTheDocument();
  });

  it('selects "Any Worker" by default (no assignedEmployeeId)', () => {
    render(<StepWorker {...defaultProps} />, { wrapper: createWrapper() });

    // "Any Worker" button should have a check icon
    const checkIcons = screen.getAllByTestId('check-icon');
    expect(checkIcons).toHaveLength(1);
  });

  it('calls onWorkerChange with worker id when clicking a worker', async () => {
    const onWorkerChange = vi.fn();
    render(<StepWorker {...defaultProps} onWorkerChange={onWorkerChange} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(await screen.findByText('John Doe'));
    expect(onWorkerChange).toHaveBeenCalledWith('w1');
  });

  it('calls onWorkerChange with undefined when clicking "Any Worker"', () => {
    const onWorkerChange = vi.fn();
    render(
      <StepWorker
        {...defaultProps}
        assignedEmployeeId="w1"
        onWorkerChange={onWorkerChange}
      />,
      { wrapper: createWrapper() },
    );

    fireEvent.click(screen.getByText('creation.anyWorker'));
    expect(onWorkerChange).toHaveBeenCalledWith(undefined);
  });

  it('shows check icon for selected worker', async () => {
    render(<StepWorker {...defaultProps} assignedEmployeeId="w1" />, {
      wrapper: createWrapper(),
    });

    await screen.findByText('John Doe');
    const checkIcons = screen.getAllByTestId('check-icon');
    expect(checkIcons).toHaveLength(1);
  });

  it('calls onNext when clicking Next', () => {
    const onNext = vi.fn();
    render(<StepWorker {...defaultProps} onNext={onNext} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('calls onBack when clicking Back', () => {
    const onBack = vi.fn();
    render(<StepWorker {...defaultProps} onBack={onBack} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.back'));
    expect(onBack).toHaveBeenCalled();
  });
});
