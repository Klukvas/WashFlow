import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { StepTimeSlot } from '../StepTimeSlot';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/utils/format', () => ({
  formatTime: (v: string) => `t:${v}`,
}));

vi.mock('@/shared/utils/cn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/ui/label', () => ({
  Label: ({ children }: any) => <label>{children}</label>,
}));

vi.mock('@/shared/ui/select', () => ({
  Select: ({ options, value, onChange }: any) => (
    <select data-testid="wp-select" value={value} onChange={onChange}>
      {options?.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@/shared/ui/card', () => ({
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
}));

vi.mock('@/shared/ui/date-picker', () => ({
  DatePicker: ({ value, onChange }: any) => (
    <input
      type="date"
      data-testid="date-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const fakeSlots = [
  {
    start: '2026-03-18T10:00:00Z',
    end: '2026-03-18T10:30:00Z',
    workPostId: 'wp1',
    workPostName: 'Post 1',
    available: true,
  },
  {
    start: '2026-03-18T10:30:00Z',
    end: '2026-03-18T11:00:00Z',
    workPostId: 'wp1',
    workPostName: 'Post 1',
    available: false,
  },
  {
    start: '2026-03-18T11:00:00Z',
    end: '2026-03-18T11:30:00Z',
    workPostId: 'wp1',
    workPostName: 'Post 1',
    available: true,
  },
];

let mockSlotsData = fakeSlots;

vi.mock('../../../hooks/useOrders', () => ({
  useAvailability: () => ({
    data: mockSlotsData,
    isLoading: false,
  }),
}));

vi.mock('@/features/branches/hooks/useBranches', () => ({
  useBranchBookingSettings: () => ({
    data: { workingDays: [1, 2, 3, 4, 5] },
  }),
}));

const fakeWorkPosts = [
  { id: 'wp1', name: 'Post 1' },
  { id: 'wp2', name: 'Post 2' },
];

vi.mock('@/shared/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          { id: 'wp1', name: 'Post 1' },
          { id: 'wp2', name: 'Post 2' },
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

describe('StepTimeSlot', () => {
  const defaultProps = {
    branchId: 'b1',
    selectedDate: '2026-03-18',
    selectedWorkPostId: '',
    scheduledStart: '',
    workPostId: undefined as string | undefined,
    totalDuration: 30,
    assignedEmployeeId: undefined as string | undefined,
    onDateChange: vi.fn(),
    onWorkPostFilterChange: vi.fn(),
    onSlotSelect: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSlotsData = fakeSlots;
  });

  it('renders the step title', () => {
    render(<StepTimeSlot {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.selectSlot')).toBeInTheDocument();
  });

  it('renders date picker', () => {
    render(<StepTimeSlot {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByTestId('date-picker')).toBeInTheDocument();
  });

  it('calls onDateChange when changing date', () => {
    const onDateChange = vi.fn();
    render(<StepTimeSlot {...defaultProps} onDateChange={onDateChange} />, {
      wrapper: createWrapper(),
    });

    fireEvent.change(screen.getByTestId('date-picker'), {
      target: { value: '2026-03-19' },
    });
    expect(onDateChange).toHaveBeenCalledWith('2026-03-19');
  });

  it('renders available time slots', () => {
    render(<StepTimeSlot {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('t:2026-03-18T10:00:00Z')).toBeInTheDocument();
    expect(screen.getByText('t:2026-03-18T11:00:00Z')).toBeInTheDocument();
  });

  it('calls onSlotSelect when clicking an available slot', () => {
    const onSlotSelect = vi.fn();
    render(<StepTimeSlot {...defaultProps} onSlotSelect={onSlotSelect} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('t:2026-03-18T10:00:00Z'));
    expect(onSlotSelect).toHaveBeenCalledWith('2026-03-18T10:00:00Z', 'wp1');
  });

  it('shows no slots message when no available slots', () => {
    mockSlotsData = [
      {
        start: '2026-03-18T10:00:00Z',
        end: '2026-03-18T10:30:00Z',
        workPostId: 'wp1',
        workPostName: 'Post 1',
        available: false,
      },
    ];

    render(<StepTimeSlot {...defaultProps} />, { wrapper: createWrapper() });

    expect(screen.getByText('creation.noSlots')).toBeInTheDocument();
  });

  it('disables Next when no slot is selected', () => {
    render(<StepTimeSlot {...defaultProps} />, { wrapper: createWrapper() });

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).toBeDisabled();
  });

  it('enables Next when a slot is selected', () => {
    render(
      <StepTimeSlot {...defaultProps} scheduledStart="2026-03-18T10:00:00Z" />,
      { wrapper: createWrapper() },
    );

    const nextBtn = screen.getByText('actions.next');
    expect(nextBtn).not.toBeDisabled();
  });

  it('calls onNext when clicking Next', () => {
    const onNext = vi.fn();
    render(
      <StepTimeSlot
        {...defaultProps}
        scheduledStart="2026-03-18T10:00:00Z"
        onNext={onNext}
      />,
      { wrapper: createWrapper() },
    );

    fireEvent.click(screen.getByText('actions.next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('calls onBack when clicking Back', () => {
    const onBack = vi.fn();
    render(<StepTimeSlot {...defaultProps} onBack={onBack} />, {
      wrapper: createWrapper(),
    });

    fireEvent.click(screen.getByText('actions.back'));
    expect(onBack).toHaveBeenCalled();
  });

  it('shows day-off warning when date is not a working day', () => {
    // Sunday (day 0) is not in workingDays [1,2,3,4,5]
    render(<StepTimeSlot {...defaultProps} selectedDate="2026-03-22" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText('creation.branchClosed')).toBeInTheDocument();
  });

  it('shows work post filter dropdown', async () => {
    render(<StepTimeSlot {...defaultProps} />, { wrapper: createWrapper() });

    // Should find the work-post select
    await screen.findByTestId('wp-select');
  });
});
