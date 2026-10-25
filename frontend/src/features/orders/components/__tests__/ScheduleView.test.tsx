import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ScheduleView } from '../ScheduleView';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  scoped: false,
  error: false,
  loading: false,
  analytics: false,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-router', () => ({ useNavigate: () => state.navigate }));
vi.mock('@/shared/hooks/useNow', () => ({
  useNow: () => Date.parse('2026-10-25T08:00:00Z'),
}));
vi.mock('@/shared/hooks/useBranchScope', () => ({
  useBranchScope: () => ({
    branchId: state.scoped ? 'b1' : null,
    isBranchScoped: state.scoped,
  }),
}));
vi.mock('@/shared/components/PermissionGate', () => ({
  PermissionGate: ({
    permission,
    children,
  }: {
    permission: string;
    children: ReactNode;
  }) => (permission === 'analytics.view' && !state.analytics ? null : children),
}));
vi.mock('@/features/analytics/components/DaySummary', () => ({
  DaySummary: () => <div>day-summary</div>,
}));
vi.mock('@/features/branches/hooks/useBranches', () => ({
  useBranches: () => ({
    data: {
      items: [
        {
          id: 'b1',
          name: 'Branch One',
          isActive: true,
          timezone: 'Europe/Kyiv',
        },
        { id: 'b2', name: 'Branch Two', isActive: true, timezone: 'UTC' },
      ],
    },
  }),
}));
vi.mock('../../hooks/useOrders', () => ({
  useSchedule: () => ({
    isLoading: state.loading,
    isError: state.error,
    data:
      state.loading || state.error
        ? undefined
        : {
            timezone: 'Europe/Kyiv',
            now: '2026-10-25T08:00:00Z',
            orders: Array.from({ length: 25 }, (_, index) => ({
              id: `o${index}`,
              status: 'IN_PROGRESS',
              vehicle: { licensePlate: `AA${index}` },
              services: [{ name: 'Wash' }],
              scheduledStart: '2026-10-25T06:00:00Z',
              scheduledEnd: '2026-10-25T07:00:00Z',
              workPost: { id: 'p1', name: 'Post 1' },
              assignedEmployee: { id: 'e1', name: 'Worker One' },
              isOverdue: index === 0,
            })),
          },
  }),
  useAvailability: () => ({
    data: [
      {
        start: '2026-10-25T10:00:00Z',
        workPostId: 'p1',
        workPostName: 'Post 1',
        available: true,
      },
      {
        start: '2026-10-25T11:00:00Z',
        workPostId: 'p1',
        workPostName: 'Post 1',
        available: false,
      },
    ],
    isLoading: false,
  }),
}));

describe('operator schedule', () => {
  beforeEach(() => {
    state.navigate.mockClear();
    state.scoped = false;
    state.loading = false;
    state.error = false;
    state.analytics = false;
  });
  it('requires a branch, and renders branch/date/post controls', () => {
    render(<ScheduleView />);
    expect(screen.getByText('schedule.selectBranchFirst')).toBeInTheDocument();
    expect(screen.getByLabelText('fields.branch')).toBeEnabled();
    expect(screen.getByLabelText('creation.date')).toHaveAttribute(
      'type',
      'date',
    );
  });
  it('shows every order beyond first 20, local time, worker, status, overdue and detail navigation', () => {
    state.scoped = true;
    render(<ScheduleView />);
    expect(screen.getByLabelText('fields.branch')).toBeDisabled();
    expect(screen.getByText('AA24')).toBeInTheDocument();
    expect(screen.getAllByText(/Worker One/)).toHaveLength(25);
    expect(screen.getByText('schedule.overdue')).toBeInTheDocument();
    expect(screen.getAllByText(/08:00 – 09:00/)).toHaveLength(25);
    fireEvent.click(screen.getByText('AA0'));
    expect(state.navigate).toHaveBeenCalledWith('/orders/o0');
    expect(screen.queryByText('day-summary')).not.toBeInTheDocument();
  });
  it('navigates free capacity to prefilled quick intake and never invents an order for unavailable capacity', () => {
    state.scoped = true;
    render(<ScheduleView />);
    fireEvent.click(screen.getByRole('button', { name: '12:00 · Post 1' }));
    expect(state.navigate.mock.calls[0][0]).toContain(
      '/orders/create?branchId=b1',
    );
    expect(state.navigate.mock.calls[0][0]).toContain('workPostId=p1');
    expect(
      screen.queryByRole('button', { name: '13:00 · Post 1' }),
    ).not.toBeInTheDocument();
  });
  it('shows query failures and loading explicitly', () => {
    state.scoped = true;
    state.error = true;
    const view = render(<ScheduleView />);
    expect(screen.getByRole('alert')).toHaveTextContent('errors.loadFailed');
    state.error = false;
    state.loading = true;
    view.rerender(<ScheduleView />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
