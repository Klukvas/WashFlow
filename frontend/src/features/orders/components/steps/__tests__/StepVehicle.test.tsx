import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StepVehicle } from '../StepVehicle';

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
    error,
    ...props
  }: {
    error?: string;
    [key: string]: unknown;
  }) => (
    <div>
      <input {...(props as React.InputHTMLAttributes<HTMLInputElement>)} />
      {error && <span data-testid="field-error">{error}</span>}
    </div>
  ),
}));

vi.mock('@/shared/ui/label', () => ({
  Label: ({ children }: { children: ReactNode }) => <label>{children}</label>,
}));

vi.mock('@/shared/ui/card', () => ({
  CardHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: ReactNode }) => <h3>{children}</h3>,
}));

vi.mock('@/shared/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div data-testid="vehicle-dialog">{children}</div> : null,
  DialogHeader: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogFooter: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon" />,
  Plus: () => <span data-testid="plus-icon" />,
}));

vi.mock('@/features/vehicles/hooks/useVehicles', () => ({
  useCreateVehicle: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: 'v1',
            licensePlate: 'AA1234BB',
            make: 'Toyota',
            model: 'Camry',
            year: 2022,
          },
          {
            id: 'v2',
            licensePlate: 'CC5678DD',
            make: 'Honda',
            model: 'Civic',
            year: 2021,
          },
        ],
        meta: { total: 2, page: 1, limit: 50, totalPages: 1 },
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

describe('StepVehicle', () => {
  const defaultProps = {
    clientId: 'c1',
    vehicleId: '',
    onVehicleChange: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the step title', () => {
    render(<StepVehicle {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.selectVehicle')).toBeInTheDocument();
  });

  it('renders vehicle list', async () => {
    render(<StepVehicle {...defaultProps} />, { wrapper: createWrapper() });

    expect(await screen.findByText('AA1234BB')).toBeInTheDocument();
    expect(screen.getByText('CC5678DD')).toBeInTheDocument();
  });

  it('shows make, model, year for vehicles', async () => {
    render(<StepVehicle {...defaultProps} />, { wrapper: createWrapper() });

    await screen.findByText('AA1234BB');
    expect(screen.getByText(/Toyota Camry/)).toBeInTheDocument();
    expect(screen.getByText(/Honda Civic/)).toBeInTheDocument();
  });

  it('calls onVehicleChange when clicking a vehicle', async () => {
    const onVehicleChange = vi.fn();
    render(
      <StepVehicle {...defaultProps} onVehicleChange={onVehicleChange} />,
      { wrapper: createWrapper() },
    );

    fireEvent.click(await screen.findByText('AA1234BB'));
    expect(onVehicleChange).toHaveBeenCalledWith('v1');
  });

  it('shows check icon for selected vehicle', async () => {
    render(<StepVehicle {...defaultProps} vehicleId="v1" />, {
      wrapper: createWrapper(),
    });

    await screen.findByText('AA1234BB');
    const checkIcons = screen.getAllByTestId('check-icon');
    expect(checkIcons).toHaveLength(1);
  });

  it('disables Next when no vehicle is selected', () => {
    render(<StepVehicle {...defaultProps} />, { wrapper: createWrapper() });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next when a vehicle is selected', () => {
    render(<StepVehicle {...defaultProps} vehicleId="v1" />, {
      wrapper: createWrapper(),
    });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onNext when clicking Next', () => {
    const onNext = vi.fn();
    render(<StepVehicle {...defaultProps} vehicleId="v1" onNext={onNext} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('calls onBack when clicking Back', () => {
    const onBack = vi.fn();
    render(<StepVehicle {...defaultProps} onBack={onBack} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows create vehicle button', () => {
    render(<StepVehicle {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText(/actions.create/)).toBeInTheDocument();
  });

  it('opens vehicle dialog when clicking create', () => {
    render(<StepVehicle {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.queryByTestId('vehicle-dialog')).not.toBeInTheDocument();

    const createBtns = screen.getAllByText(/actions.create/);
    fireEvent.click(createBtns[0]);

    expect(screen.getByTestId('vehicle-dialog')).toBeInTheDocument();
  });
});
