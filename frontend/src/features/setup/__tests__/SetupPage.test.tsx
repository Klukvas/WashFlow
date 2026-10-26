import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { SetupPage } from '../pages/SetupPage';
const state = vi.hoisted(() => ({
  scope: null as string | null,
  permissions: new Set<string>(),
  branches: vi.fn(),
  settings: vi.fn(),
  posts: vi.fn(),
  services: vi.fn(),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.permission ? `${key} ${values.permission}` : key,
  }),
}));
vi.mock('@/shared/hooks/usePermissions', () => ({
  usePermissions: () => ({
    hasPermission: (p: string) => state.permissions.has(p),
    hasAllPermissions: (p: string[]) =>
      p.every((v) => state.permissions.has(v)),
  }),
}));
vi.mock('@/shared/hooks/useBranchScope', () => ({
  useBranchScope: () => ({
    branchId: state.scope,
    isBranchScoped: !!state.scope,
  }),
}));
vi.mock('@/features/branches/api/branches.api', () => ({
  fetchAllBranches: state.branches,
  fetchBranchBookingSettings: state.settings,
  createBranch: vi.fn(),
  updateBranch: vi.fn(),
  updateBranchBookingSettings: vi.fn(),
}));
vi.mock('@/features/work-posts/api/work-posts.api', () => ({
  fetchWorkPosts: state.posts,
  createWorkPost: vi.fn(),
}));
vi.mock('@/features/services/api/services.api', () => ({
  fetchServices: state.services,
  createService: vi.fn(),
}));
const branch = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  name: 'Wash A',
  timezone: 'Europe/Kyiv',
  isActive: true,
  deletedAt: null,
};
const branchB = {
  ...branch,
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Wash B',
};
const settings = {
  id: branch.id,
  branchId: branch.id,
  workingHoursStart: '08:00',
  workingHoursEnd: '18:00',
  workingDays: [1],
  slotDurationMinutes: 30,
  bufferTimeMinutes: 0,
  maxAdvanceBookingDays: 30,
  allowOnlineBooking: false,
};
function show(path = `/setup?branchId=${branch.id}`) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <SetupPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.scope = null;
  state.permissions = new Set([
    'branches.read',
    'branches.create',
    'branches.update',
    'work-posts.read',
    'work-posts.create',
    'services.read',
    'services.create',
    'orders.create',
    'orders.read',
    'clients.read',
    'vehicles.read',
    'scheduling.read',
  ]);
  state.branches.mockResolvedValue([branch, branchB]);
  state.settings.mockResolvedValue(settings);
  state.posts.mockImplementation(async ({ branchId }) => ({
    items: [
      {
        id: branch.id,
        branchId,
        tenantId: branch.tenantId,
        isActive: true,
        deletedAt: null,
      },
    ],
  }));
  state.services.mockResolvedValue({
    items: [
      {
        id: branch.id,
        tenantId: branch.tenantId,
        isActive: true,
        deletedAt: null,
        price: '0.00',
        durationMin: 30,
      },
    ],
  });
});
describe('setup access and readiness', () => {
  it('zero active branches keeps the creation flow and 0/4 without dependent requests', async () => {
    state.branches.mockResolvedValue([]);
    show('/setup');
    expect(await screen.findByText(/0\/4/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'setup.createBranch' }),
    ).toBeInTheDocument();
    expect(state.settings).not.toHaveBeenCalled();
    expect(state.posts).not.toHaveBeenCalled();
    expect(state.services).not.toHaveBeenCalled();
  });
  it('one active branch auto-selects and verifies its resources', async () => {
    state.branches.mockResolvedValue([branch]);
    show('/setup');
    expect(
      await screen.findByRole('link', { name: 'setup.quickOrder' }),
    ).toHaveAttribute('href', `/orders/create?branchId=${branch.id}`);
    expect(screen.getByLabelText('setup.branch')).toHaveValue(branch.id);
    expect(state.settings).toHaveBeenCalledWith(branch.id);
  });
  it('multiple branches require explicit choice without false missing facts or dependent requests', async () => {
    show('/setup');
    const select = await screen.findByLabelText('setup.branch');
    expect(select).toHaveValue('');
    expect(screen.getByRole('status')).toHaveTextContent('setup.selectBranch');
    expect(screen.queryByText(/0\/4/)).not.toBeInTheDocument();
    expect(screen.queryByText('setup.rows.hours')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'setup.quickOrder' }),
    ).not.toBeInTheDocument();
    expect(state.settings).not.toHaveBeenCalled();
    expect(state.posts).not.toHaveBeenCalled();
    expect(state.services).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: branchB.id } });
    expect(
      await screen.findByRole('link', { name: 'setup.quickOrder' }),
    ).toHaveAttribute('href', `/orders/create?branchId=${branchB.id}`);
    expect(state.settings).toHaveBeenCalledWith(branchB.id);
    expect(state.posts).toHaveBeenCalledWith({ branchId: branchB.id });
  });
  it('shows four persisted facts and passes selected branch to quick order without staff/online booking', async () => {
    show();
    const link = await screen.findByRole('link', { name: 'setup.quickOrder' });
    expect(link).toHaveAttribute(
      'href',
      `/orders/create?branchId=${branch.id}`,
    );
    expect(screen.getByText('4/4')).toBeInTheDocument();
    expect(state.services).toHaveBeenCalledWith({});
  });
  it('never requests a forged scoped branch', async () => {
    state.scope = branch.id;
    show(`/setup?branchId=${branchB.id}`);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'setup.unavailableBranch',
    );
    expect(state.branches).not.toHaveBeenCalled();
    expect(state.settings).not.toHaveBeenCalled();
  });
  it.each(['branches.read', 'work-posts.read', 'services.read'])(
    'gates %s before its request',
    async (permission) => {
      state.permissions.delete(permission);
      show();
      if (permission === 'branches.read') {
        expect(state.branches).not.toHaveBeenCalled();
      } else {
        await screen.findByText('setup.rows.post');
        expect(
          permission === 'work-posts.read' ? state.posts : state.services,
        ).not.toHaveBeenCalled();
      }
      expect(
        screen.queryByRole('link', { name: 'setup.quickOrder' }),
      ).not.toBeInTheDocument();
    },
  );
  it.each(['branches.update', 'work-posts.create', 'services.create'])(
    'explains missing custom-role write %s',
    async (permission) => {
      state.permissions.delete(permission);
      show();
      expect(
        await screen.findAllByText(
          `setup.writeRequired setup.capabilities.${permission.replace(/[.-]/g, '_')}`,
        ),
      ).not.toHaveLength(0);
    },
  );
  it('unsaved defaults are incomplete and initial hours can be saved unchanged', async () => {
    state.settings.mockResolvedValue(null);
    show();
    fireEvent.click(
      await screen.findByRole('button', { name: 'setup.actions.hours' }),
    );
    expect(screen.getByRole('button', { name: 'actions.save' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'setup.quickOrder' }),
    ).not.toBeInTheDocument();
  });
  it('a resource error has retry and never displays cached complete during refetch', async () => {
    state.posts.mockRejectedValueOnce(new Error('offline'));
    const client = show();
    const retry = await screen.findByRole('button', { name: 'setup.retry' });
    fireEvent.click(retry);
    await screen.findByRole('link', { name: 'setup.quickOrder' });
    let resolve: ((value: unknown) => void) | undefined;
    state.posts.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    void client.invalidateQueries({ queryKey: ['work-posts'] });
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'setup.quickOrder' }),
      ).not.toBeInTheDocument(),
    );
    resolve?.({ items: [] });
  });
  it('branch switch isolates late A results and resets forms', async () => {
    let resolveA: ((value: unknown) => void) | undefined;
    state.settings.mockImplementation((id: string) =>
      id === branch.id
        ? new Promise((r) => {
            resolveA = r;
          })
        : Promise.resolve({ ...settings, branchId: branchB.id }),
    );
    show();
    await screen.findByText('setup.rows.hours');
    fireEvent.change(screen.getByLabelText('setup.branch'), {
      target: { value: branchB.id },
    });
    expect(
      await screen.findByRole('link', { name: 'setup.quickOrder' }),
    ).toHaveAttribute('href', `/orders/create?branchId=${branchB.id}`);
    resolveA?.(null);
    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'setup.quickOrder' }),
      ).toHaveAttribute('href', `/orders/create?branchId=${branchB.id}`),
    );
  });
});
