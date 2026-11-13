import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCards } from '../StatsCards';
import { fetchDashboardStats } from '../../api/dashboard.api';
import { apiClient } from '@/shared/api/client';
import { formatCurrency } from '@/shared/utils/format';

vi.mock('@/shared/api/client', () => ({ apiClient: { get: vi.fn() } }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const response = {
  totalOrders: 100,
  completedOrders: 85,
  cancelledOrders: 10,
  totalRevenue: '1234.56',
  completionRate: 85,
};

describe('StatsCards API contract', () => {
  it('renders all-time aggregates from the actual dashboard response, without invented daily or client counts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: response } });
    const data = await fetchDashboardStats();
    render(<StatsCards data={data} loading={false} />);
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText(formatCurrency(1234.56), { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getAllByText('statsCards.allTime')).toHaveLength(4);
    expect(screen.queryByText('statsCards.activeClients')).not.toBeInTheDocument();
    expect(screen.queryByText(/today/)).not.toBeInTheDocument();
  });

  it('shows unavailable values instead of zero when no response exists', () => {
    render(<StatsCards loading={false} />);
    expect(screen.getAllByText('—')).toHaveLength(4);
    expect(screen.queryByText('0')).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('renders genuine zero aggregates as zeros', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: {
      totalOrders: 0, completedOrders: 0, cancelledOrders: 0, totalRevenue: 0, completionRate: 0,
    } } });
    render(<StatsCards data={await fetchDashboardStats()} loading={false} />);
    expect(screen.getAllByText('0')).toHaveLength(2);
    expect(screen.getByText(formatCurrency(0), { normalizer: (text) => text })).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('renders loading skeletons', () => {
    const { container } = render(<StatsCards loading />);
    expect(container.querySelectorAll('.h-32')).toHaveLength(4);
  });
});
