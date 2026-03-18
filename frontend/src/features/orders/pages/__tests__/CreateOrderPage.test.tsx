import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { CreateOrderPage } from '../CreateOrderPage';

const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}));

vi.mock('@/shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/shared/components/PageHeader', () => ({
  PageHeader: ({ title, actions }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));

vi.mock('@/shared/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children, className }: any) => (
    <div data-testid="card-content" className={className}>
      {children}
    </div>
  ),
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock('@/shared/ui/select', () => ({
  Select: ({ options, value, onChange, placeholder }: any) => (
    <select data-testid="select" value={value} onChange={onChange}>
      {placeholder && <option value="">{placeholder}</option>}
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('lucide-react', () => ({
  ArrowLeft: () => <span />,
  Check: () => <span data-testid="check-icon" />,
  User: () => <span data-testid="user-icon" />,
  Clock: () => <span data-testid="clock-icon" />,
  Wrench: () => <span data-testid="wrench-icon" />,
}));

vi.mock('../../hooks/useOrders', () => ({
  useCreateOrder: () => ({
    mutate: vi.fn(),
    isPending: false,
  }),
}));

// Mock step components to simplify page-level tests
vi.mock('../../components/steps/StepBranchClient', () => ({
  StepBranchClient: (props: any) => (
    <div data-testid="step-branch-client">
      <button onClick={props.onNext}>next-branch-client</button>
    </div>
  ),
}));

vi.mock('../../components/steps/StepVehicle', () => ({
  StepVehicle: (props: any) => (
    <div data-testid="step-vehicle">
      <button onClick={props.onNext}>next-vehicle</button>
      <button onClick={props.onBack}>back-vehicle</button>
    </div>
  ),
}));

vi.mock('../../components/steps/StepServices', () => ({
  StepServices: (props: any) => (
    <div data-testid="step-services">
      <button onClick={props.onNext}>next-services</button>
      <button onClick={props.onBack}>back-services</button>
    </div>
  ),
}));

vi.mock('../../components/steps/StepWorker', () => ({
  StepWorker: (props: any) => (
    <div data-testid="step-worker">
      <button onClick={props.onNext}>next-worker</button>
      <button onClick={props.onBack}>back-worker</button>
    </div>
  ),
}));

vi.mock('../../components/steps/StepTimeSlot', () => ({
  StepTimeSlot: (props: any) => (
    <div data-testid="step-timeslot">
      <button onClick={props.onNext}>next-timeslot</button>
      <button onClick={props.onBack}>back-timeslot</button>
    </div>
  ),
}));

vi.mock('../../components/steps/StepReview', () => ({
  StepReview: (props: any) => (
    <div data-testid="step-review">
      <button onClick={props.onConfirm}>confirm-review</button>
      <button onClick={props.onBack}>back-review</button>
    </div>
  ),
}));

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [{ id: 'b1', name: 'Branch 1' }],
        meta: { total: 1, page: 1, limit: 100, totalPages: 1 },
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

describe('CreateOrderPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  describe('Mode Selector', () => {
    it('renders mode selector when no URL params', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      expect(screen.getByText('creation.chooseStartMode')).toBeInTheDocument();
      expect(screen.getByText('creation.startFromClient')).toBeInTheDocument();
      expect(screen.getByText('creation.startFromTime')).toBeInTheDocument();
      expect(screen.getByText('creation.startFromService')).toBeInTheDocument();
    });

    it('renders 3 mode cards with icons', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('user-icon')).toBeInTheDocument();
      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
      expect(screen.getByTestId('wrench-icon')).toBeInTheDocument();
    });

    it('renders descriptions for each mode', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      expect(
        screen.getByText('creation.startFromClientDesc'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('creation.startFromTimeDesc'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('creation.startFromServiceDesc'),
      ).toBeInTheDocument();
    });

    it('enters client-first mode when clicking "Start from Client"', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('creation.startFromClient'));

      // Mode cards should disappear, first step should show
      expect(
        screen.queryByText('creation.startFromClientDesc'),
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('step-branch-client')).toBeInTheDocument();
    });

    it('enters time-first mode when clicking "Start from Time"', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('creation.startFromTime'));

      // Mode cards should disappear
      expect(
        screen.queryByText('creation.startFromTimeDesc'),
      ).not.toBeInTheDocument();
    });

    it('enters service-first mode when clicking "Start from Service"', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('creation.startFromService'));

      expect(
        screen.queryByText('creation.startFromServiceDesc'),
      ).not.toBeInTheDocument();
    });
  });

  describe('URL Prefill', () => {
    it('skips mode selector when URL has prefill params', () => {
      mockSearchParams = new URLSearchParams({
        branchId: 'b1',
        date: '2026-03-18',
        time: '2026-03-18T10:00:00Z',
        workPostId: 'wp1',
      });

      render(<CreateOrderPage />, { wrapper: createWrapper() });

      // Should NOT show mode selector cards (descriptions)
      expect(
        screen.queryByText('creation.startFromClientDesc'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText('creation.startFromTimeDesc'),
      ).not.toBeInTheDocument();
    });

    it('does not skip mode selector when URL has partial params', () => {
      mockSearchParams = new URLSearchParams({
        branchId: 'b1',
      });

      render(<CreateOrderPage />, { wrapper: createWrapper() });

      // Should still show mode selector
      expect(screen.getByText('creation.chooseStartMode')).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('renders page header with back button', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      expect(screen.getByText('createOrder')).toBeInTheDocument();
      expect(screen.getByText('actions.back')).toBeInTheDocument();
    });

    it('navigates to /orders when clicking back', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('actions.back'));
      expect(mockNavigate).toHaveBeenCalledWith('/orders');
    });
  });

  describe('Client-first wizard flow', () => {
    it('navigates through steps in client-first mode', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      // Select client-first mode
      fireEvent.click(screen.getByText('creation.startFromClient'));

      // Step 0: Branch + Client
      expect(screen.getByTestId('step-branch-client')).toBeInTheDocument();

      // Go to step 1
      fireEvent.click(screen.getByText('next-branch-client'));
      expect(screen.getByTestId('step-vehicle')).toBeInTheDocument();

      // Go to step 2
      fireEvent.click(screen.getByText('next-vehicle'));
      expect(screen.getByTestId('step-services')).toBeInTheDocument();

      // Go to step 3
      fireEvent.click(screen.getByText('next-services'));
      expect(screen.getByTestId('step-worker')).toBeInTheDocument();

      // Go to step 4
      fireEvent.click(screen.getByText('next-worker'));
      expect(screen.getByTestId('step-timeslot')).toBeInTheDocument();

      // Go to step 5
      fireEvent.click(screen.getByText('next-timeslot'));
      expect(screen.getByTestId('step-review')).toBeInTheDocument();
    });

    it('can go back through steps', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      // Enter client-first mode, advance to step 1
      fireEvent.click(screen.getByText('creation.startFromClient'));
      fireEvent.click(screen.getByText('next-branch-client'));
      expect(screen.getByTestId('step-vehicle')).toBeInTheDocument();

      // Go back
      fireEvent.click(screen.getByText('back-vehicle'));
      expect(screen.getByTestId('step-branch-client')).toBeInTheDocument();
    });
  });

  describe('Step indicator', () => {
    it('renders step indicators after selecting a mode', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('creation.startFromClient'));

      // Should show check icons for completed steps, numbers for pending
      const checkIcons = screen.queryAllByTestId('check-icon');
      // At step 0, no completed steps yet
      expect(checkIcons).toHaveLength(0);
    });

    it('shows mode change button after selecting a mode', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('creation.startFromClient'));

      expect(screen.getByText('creation.chooseStartMode')).toBeInTheDocument();
    });

    it('returns to mode selector when clicking mode change button', () => {
      render(<CreateOrderPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('creation.startFromClient'));

      // Click the mode change button (in header actions)
      fireEvent.click(screen.getByText('creation.chooseStartMode'));

      // Should show mode cards again
      expect(screen.getByText('creation.startFromClient')).toBeInTheDocument();
      expect(screen.getByText('creation.startFromTime')).toBeInTheDocument();
    });
  });
});
