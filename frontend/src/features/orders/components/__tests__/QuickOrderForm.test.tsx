import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QuickOrderForm } from '../QuickOrderForm';

const state = vi.hoisted(() => ({
  navigate: vi.fn(),
  create: vi.fn(),
  fetching: false,
  params: new URLSearchParams(),
  scope: '11111111-1111-4111-8111-111111111111',
  duration: 30,
  slot: '2026-10-25T10:00:00Z',
}));
const ids = {
  branch: '11111111-1111-4111-8111-111111111111',
  client: '33333333-3333-4333-8333-333333333333',
  vehicle: '44444444-4444-4444-8444-444444444444',
  service: '55555555-5555-4555-8555-555555555555',
  post: '77777777-7777-4777-8777-777777777777',
};
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-router', () => ({
  useNavigate: () => state.navigate,
  useSearchParams: () => [state.params],
}));
vi.mock('@/shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/shared/hooks/useNow', () => ({
  useNow: () => Date.parse('2026-10-25T08:00:00Z'),
}));
vi.mock('@/shared/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));
vi.mock('@/shared/hooks/useBranchScope', () => ({
  useBranchScope: () => ({
    branchId: state.scope || null,
    isBranchScoped: !!state.scope,
  }),
}));
vi.mock('@/shared/components/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/features/branches/hooks/useBranches', () => ({
  useBranches: () => ({
    data: {
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Branch',
          timezone: 'Europe/Kyiv',
          isActive: true,
        },
      ],
    },
  }),
}));
vi.mock('@/features/services/hooks/useServices', () => ({
  useServices: () => ({
    data: {
      items: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          name: 'Wash',
          price: '0.10',
          durationMin: 30,
          isActive: true,
        },
      ],
    },
  }),
}));
vi.mock('@/features/clients/api/clients.api', () => ({
  fetchClients: async () => ({
    items: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        firstName: 'Olena',
        phone: '1234567',
      },
    ],
  }),
}));
vi.mock('@/features/vehicles/api/vehicles.api', () => ({
  fetchVehicles: async () => ({ items: [] }),
}));
vi.mock('@/features/clients/hooks/useClients', () => ({
  useCreateClient: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/clients/components/ClientForm', () => ({
  ClientForm: () => null,
}));
vi.mock('../steps/StepVehicle', () => ({
  StepVehicle: ({
    onVehicleChange,
  }: {
    onVehicleChange: (id: string) => void;
  }) => (
    <button
      onClick={() => onVehicleChange('44444444-4444-4444-8444-444444444444')}
    >
      select vehicle
    </button>
  ),
}));
vi.mock('../../hooks/useOrders', () => ({
  useCreateOrder: () => ({ mutate: state.create, isPending: false }),
  useAvailability: (params: { durationMinutes?: number }) => ({
    isFetching: state.fetching,
    data: params.durationMinutes
      ? [
          {
            start: state.slot,
            workPostId: '77777777-7777-4777-8777-777777777777',
            workPostName: 'Post',
            available: true,
          },
        ]
      : [],
  }),
}));
function mount() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <QuickOrderForm />
    </QueryClientProvider>,
  );
}
async function choose() {
  fireEvent.change(screen.getByLabelText('quick.search'), {
    target: { value: '123' },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Olena 1234567' }));
  fireEvent.click(screen.getByRole('button', { name: 'select vehicle' }));
  fireEvent.click(screen.getByRole('checkbox'));
}
describe('quick intake', () => {
  afterEach(() => vi.restoreAllMocks());
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T08:00:00Z'));
    state.create.mockClear();
    state.navigate.mockClear();
    state.fetching = false;
    state.params = new URLSearchParams();
    state.slot = '2026-10-25T10:00:00Z';
  });
  it('auto-selects a safe branch, guards missing inputs/fetching and prevents duplicate create', async () => {
    const view = mount();
    expect(screen.getByLabelText('fields.branch')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    ).toBeDisabled();
    await choose();
    state.fetching = true;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickOrderForm />
      </QueryClientProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    ).toBeDisabled();
    state.fetching = false;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <QuickOrderForm />
      </QueryClientProvider>,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    );
    expect(state.create).toHaveBeenCalledTimes(1);
    expect(state.create.mock.calls[0][0]).toEqual({
      branchId: ids.branch,
      clientId: ids.client,
      vehicleId: ids.vehicle,
      serviceIds: [ids.service],
      workPostId: ids.post,
      scheduledStart: state.slot,
    });
  });
  it('preserves schedule prefill and requires a new slot when fresh duration availability differs', async () => {
    state.params = new URLSearchParams({
      branchId: ids.branch,
      date: '2026-10-25',
      time: state.slot,
      workPostId: ids.post,
    });
    state.slot = '2026-10-25T12:00:00Z';
    mount();
    await choose();
    expect(screen.getByText('quick.slotChanged')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('quick.earliest'), {
      target: { value: `${state.slot}|${ids.post}` },
    });
    expect(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'quick.wizard' }));
    expect(state.navigate.mock.calls[0][0]).toContain('mode=wizard');
    expect(state.navigate.mock.calls[0][0]).toContain('workPostId=');
  });
  it('changing search clears the client and vehicle so a stale identity cannot submit', async () => {
    mount();
    await choose();
    fireEvent.change(screen.getByLabelText('quick.search'), {
      target: { value: 'other' },
    });
    expect(
      screen.getByRole('button', { name: 'creation.confirmBooking' }),
    ).toBeDisabled();
  });
});
