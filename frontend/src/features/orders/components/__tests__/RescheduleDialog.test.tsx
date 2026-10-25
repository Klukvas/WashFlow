import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RescheduleDialog } from '../RescheduleDialog';
import type { Order } from '@/shared/types/models';

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  availability: vi.fn(),
  fetching: false,
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/shared/hooks/useNow', () => ({
  useNow: () => Date.parse('2026-10-25T08:00:00Z'),
}));
vi.mock('@/shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/features/work-posts/hooks/useWorkPosts', () => ({
  useWorkPosts: () => ({ data: { items: [{ id: 'post2', name: 'Post 2' }] } }),
}));
vi.mock('@/features/workforce/api/workforce.api', () => ({
  fetchProfiles: async () => ({
    items: [
      {
        id: 'employee2',
        userId: 'user2',
        isWorker: true,
        active: true,
        user: { firstName: 'New', lastName: 'Worker' },
      },
    ],
  }),
}));
vi.mock('../../hooks/useOrders', () => ({
  useRescheduleOrder: () => ({ mutate: state.mutate, isPending: false }),
  useAvailability: (params: { workPostId: string }) => {
    state.availability(params);
    return {
      isFetching: state.fetching,
      data: [
        {
          start: '2026-10-25T12:00:00Z',
          workPostId: params.workPostId,
          workPostName: params.workPostId,
          available: true,
        },
      ],
    };
  },
}));
const order = {
  id: 'order1',
  branchId: 'branch1',
  workPostId: 'post1',
  workPost: { name: 'Post 1' },
  assignedEmployeeId: 'employee1',
  branch: { timezone: 'Europe/Kyiv' },
  scheduledStart: '2026-10-25T10:00:00Z',
  scheduledEnd: '2026-10-25T11:15:00Z',
  status: 'BOOKED',
} as unknown as Order;
function mount() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RescheduleDialog order={order} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe('reschedule dialog', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T08:00:00Z'));
    state.mutate.mockClear();
    state.availability.mockClear();
    state.fetching = false;
  });
  it('excludes itself and uses persisted duration and resources; omitted selections stay omitted', () => {
    mount();
    expect(state.availability).toHaveBeenCalledWith(
      expect.objectContaining({
        branchId: 'branch1',
        durationMinutes: 75,
        excludeOrderId: 'order1',
        assignedEmployeeId: 'employee1',
        workPostId: 'post1',
      }),
    );
    fireEvent.change(screen.getByLabelText('creation.selectSlot'), {
      target: { value: '2026-10-25T12:00:00Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'reschedule.save' }));
    expect(state.mutate.mock.calls[0][0]).toEqual({
      id: 'order1',
      scheduledStart: '2026-10-25T12:00:00Z',
    });
    fireEvent.click(screen.getByRole('button', { name: 'reschedule.save' }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
  });
  it('changing resources invalidates selection and submits profile id only after selecting a fresh slot', async () => {
    mount();
    await screen.findByRole('option', { name: 'New Worker' });
    fireEvent.change(screen.getByLabelText('creation.selectSlot'), {
      target: { value: '2026-10-25T12:00:00Z' },
    });
    fireEvent.change(screen.getByLabelText('fields.assignedWorker'), {
      target: { value: 'employee2' },
    });
    expect(
      screen.getByRole('button', { name: 'reschedule.save' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('fields.workPost'), {
      target: { value: 'post2' },
    });
    fireEvent.change(screen.getByLabelText('creation.selectSlot'), {
      target: { value: '2026-10-25T12:00:00Z' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'reschedule.save' }));
    expect(state.mutate.mock.calls[0][0]).toEqual({
      id: 'order1',
      scheduledStart: '2026-10-25T12:00:00Z',
      workPostId: 'post2',
      assignedEmployeeId: 'employee2',
    });
  });
});
