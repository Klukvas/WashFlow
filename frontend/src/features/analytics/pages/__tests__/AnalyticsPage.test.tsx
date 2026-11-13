import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AnalyticsPage } from '../AnalyticsPage';
import { apiClient } from '@/shared/api/client';
import { formatCurrency } from '@/shared/utils/format';

vi.mock('@/shared/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/branches/hooks/useBranches', () => ({ useBranches: () => ({ data: { items: [] } }) }));
vi.mock('@/shared/hooks/useBranchScope', () => ({ useBranchScope: () => ({ branchId: null, isBranchScoped: false }) }));
vi.mock('@/shared/ui/date-picker', () => ({
  DatePicker: ({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) =>
    <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
vi.mock('../../../dashboard/components/RevenueChart', () => ({ default: () => null }));
vi.mock('../../components/PopularServicesChart', () => ({ default: () => null }));

const aggregate = { totalOrders: 100, completedOrders: 85, cancelledOrders: 10, totalRevenue: '1234.56', completionRate: 85 };

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>);
}

describe('AnalyticsPage aggregate contract', () => {
  it('renders the actual aggregates and distinguishes all-time from a selected date range', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data: { data: url === '/analytics/dashboard' ? aggregate : [] } }));
    renderPage();
    expect(await screen.findByText(formatCurrency(1234.56), { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByText('completedOrders')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.queryByText('activeClients')).not.toBeInTheDocument();
    expect(screen.getByText('allTime')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('dateFrom'), { target: { value: '2026-11-01' } });
    expect(screen.getByText('selectedPeriod')).toBeInTheDocument();
    await waitFor(() => expect(apiClient.get).toHaveBeenCalledWith('/analytics/dashboard', {
      params: { branchId: undefined, dateFrom: '2026-11-01', dateTo: undefined },
    }));
  });

  it('shows a loading error for an incompatible contract without displaying false zeros', async () => {
    vi.mocked(apiClient.get).mockImplementation(async (url) => ({ data: { data: url === '/analytics/dashboard' ? { totalOrders: 100 } : [] } }));
    renderPage();
    expect(await screen.findByText('errors.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });
});
