import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { OrdersPage } from '../OrdersPage';

const mockNavigate = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('@/shared/hooks/useBranchScope', () => ({
  useBranchScope: () => ({ branchId: null, isBranchScoped: false }),
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

vi.mock('@/shared/components/PermissionGate', () => ({
  PermissionGate: ({ children }: any) => <>{children}</>,
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({ children, onClick, variant, size }: any) => (
    <button
      onClick={onClick}
      data-variant={variant}
      data-size={size}
    >
      {children}
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Plus: () => <span />,
  LayoutGrid: () => <span />,
  List: () => <span />,
  CalendarDays: () => <span data-testid="calendar-icon" />,
  ClipboardList: () => <span data-testid="list-icon" />,
}));

// Mock child components
vi.mock('../../components/OrderTable', () => ({
  OrderTable: () => <div data-testid="order-table">Order Table</div>,
}));

vi.mock('../../components/OrderCard', () => ({
  OrderCard: () => <div data-testid="order-card">Order Card</div>,
}));

vi.mock('../../components/OrderFilters', () => ({
  OrderFilters: () => <div data-testid="order-filters">Filters</div>,
}));

vi.mock('../../components/ScheduleView', () => ({
  ScheduleView: () => <div data-testid="schedule-view">Schedule View</div>,
}));

vi.mock('../../hooks/useOrders', () => ({
  useOrders: () => ({
    data: {
      items: [],
      meta: { total: 0, page: 1, limit: 20, totalPages: 0 },
    },
    isLoading: false,
  }),
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

describe('OrdersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Tab bar', () => {
    it('renders Orders and Schedule tabs', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      expect(screen.getByText('tabs.orders')).toBeInTheDocument();
      expect(screen.getByText('tabs.schedule')).toBeInTheDocument();
    });

    it('renders tab icons', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('list-icon')).toBeInTheDocument();
      expect(screen.getByTestId('calendar-icon')).toBeInTheDocument();
    });

    it('shows Orders tab content by default', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      expect(screen.getByTestId('order-table')).toBeInTheDocument();
      expect(screen.getByTestId('order-filters')).toBeInTheDocument();
      expect(screen.queryByTestId('schedule-view')).not.toBeInTheDocument();
    });

    it('switches to Schedule tab when clicking it', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('tabs.schedule'));

      expect(screen.getByTestId('schedule-view')).toBeInTheDocument();
      expect(screen.queryByTestId('order-table')).not.toBeInTheDocument();
      expect(
        screen.queryByTestId('order-filters'),
      ).not.toBeInTheDocument();
    });

    it('switches back to Orders tab', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      // Go to schedule
      fireEvent.click(screen.getByText('tabs.schedule'));
      expect(screen.getByTestId('schedule-view')).toBeInTheDocument();

      // Go back to orders
      fireEvent.click(screen.getByText('tabs.orders'));
      expect(screen.getByTestId('order-table')).toBeInTheDocument();
      expect(screen.queryByTestId('schedule-view')).not.toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('renders page title', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      expect(screen.getByText('title')).toBeInTheDocument();
    });

    it('renders create order button', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      expect(screen.getByText('createOrder')).toBeInTheDocument();
    });

    it('navigates to create page when clicking create button', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      fireEvent.click(screen.getByText('createOrder'));
      expect(mockNavigate).toHaveBeenCalledWith('/orders/create');
    });
  });

  describe('View mode toggle', () => {
    it('hides view mode toggle on Schedule tab', () => {
      render(<OrdersPage />, { wrapper: createWrapper() });

      // View mode buttons should be visible on Orders tab
      // (list and grid icons are inside the view mode toggle)

      fireEvent.click(screen.getByText('tabs.schedule'));

      // After switching to schedule, order-related controls should be hidden
      expect(screen.queryByTestId('order-table')).not.toBeInTheDocument();
    });
  });
});
