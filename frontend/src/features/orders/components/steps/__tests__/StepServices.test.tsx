import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StepServices } from '../StepServices';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/utils/format', () => ({
  formatCurrency: (v: number) => `$${v}`,
  formatDuration: (v: number) => `${v}m`,
}));

vi.mock('@/shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/card', () => ({
  CardHeader: ({ children, className }: any) => (
    <div data-testid="card-header" className={className}>
      {children}
    </div>
  ),
  CardTitle: ({ children, className }: any) => (
    <h3 data-testid="card-title" className={className}>
      {children}
    </h3>
  ),
}));

vi.mock('lucide-react', () => ({
  Check: () => <span data-testid="check-icon" />,
}));

const fakeServices = [
  {
    id: 's1',
    name: 'Wash',
    durationMin: 30,
    price: '100',
    isActive: true,
  },
  {
    id: 's2',
    name: 'Polish',
    durationMin: 60,
    price: '200',
    isActive: true,
  },
  {
    id: 's3',
    name: 'Interior',
    durationMin: 45,
    price: '150',
    isActive: true,
  },
];

vi.mock('@/features/services/hooks/useServices', () => ({
  useServices: () => ({
    data: {
      items: fakeServices,
      meta: { total: 3, page: 1, limit: 100, totalPages: 1 },
    },
    isLoading: false,
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

describe('StepServices', () => {
  const defaultProps = {
    serviceIds: [] as string[],
    onToggleService: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the step title', async () => {
    render(<StepServices {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.selectServices')).toBeInTheDocument();
  });

  it('renders service list from query', async () => {
    render(<StepServices {...defaultProps} />, { wrapper: createWrapper() });

    // Services are rendered from react-query; they should appear
    expect(await screen.findByText('Wash')).toBeInTheDocument();
    expect(screen.getByText('Polish')).toBeInTheDocument();
    expect(screen.getByText('Interior')).toBeInTheDocument();
  });

  it('shows price and duration for each service', async () => {
    render(<StepServices {...defaultProps} />, { wrapper: createWrapper() });

    expect(await screen.findByText('$100')).toBeInTheDocument();
    expect(screen.getByText('30m')).toBeInTheDocument();
    expect(screen.getByText('$200')).toBeInTheDocument();
    expect(screen.getByText('60m')).toBeInTheDocument();
  });

  it('calls onToggleService when clicking a service', async () => {
    const onToggleService = vi.fn();
    render(
      <StepServices {...defaultProps} onToggleService={onToggleService} />,
      { wrapper: createWrapper() },
    );

    const washBtn = await screen.findByText('Wash');
    fireEvent.click(washBtn);

    expect(onToggleService).toHaveBeenCalledWith('s1');
  });

  it('shows check icon for selected services', async () => {
    render(<StepServices {...defaultProps} serviceIds={['s1', 's3']} />, {
      wrapper: createWrapper(),
    });

    await screen.findByText('Wash');
    const checkIcons = screen.getAllByTestId('check-icon');
    expect(checkIcons).toHaveLength(2);
  });

  it('shows total duration and price when services are selected', async () => {
    render(<StepServices {...defaultProps} serviceIds={['s1', 's2']} />, {
      wrapper: createWrapper(),
    });

    await screen.findByText('Wash');

    // Total duration: 30 + 60 = 90
    expect(screen.getByText('90m')).toBeInTheDocument();
    // Total price: 100 + 200 = 300
    expect(screen.getByText('$300')).toBeInTheDocument();
  });

  it('does not show totals when no services are selected', async () => {
    render(<StepServices {...defaultProps} serviceIds={[]} />, {
      wrapper: createWrapper(),
    });

    await screen.findByText('Wash');

    expect(
      screen.queryByText('creation.totalDuration'),
    ).not.toBeInTheDocument();
  });

  it('disables Next button when no services are selected', () => {
    render(<StepServices {...defaultProps} serviceIds={[]} />, {
      wrapper: createWrapper(),
    });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next button when services are selected', () => {
    render(<StepServices {...defaultProps} serviceIds={['s1']} />, {
      wrapper: createWrapper(),
    });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onNext when clicking Next', () => {
    const onNext = vi.fn();
    render(
      <StepServices {...defaultProps} serviceIds={['s1']} onNext={onNext} />,
      { wrapper: createWrapper() },
    );

    fireEvent.click(screen.getByText('actions.next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('calls onBack when clicking Back', () => {
    const onBack = vi.fn();
    render(<StepServices {...defaultProps} onBack={onBack} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.back'));
    expect(onBack).toHaveBeenCalled();
  });
});
