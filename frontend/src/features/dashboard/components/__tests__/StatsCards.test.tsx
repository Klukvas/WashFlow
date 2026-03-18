import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatsCards } from '../StatsCards';
import type { DashboardStats } from '../../api/dashboard.api';

vi.mock('@/shared/utils/format', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts && 'count' in opts) return `${opts.count} today`;
      if (opts && 'value' in opts) return `today: ${opts.value}`;
      return key;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('StatsCards', () => {
  it('renders loading skeletons when loading', () => {
    const { container } = render(<StatsCards loading={true} />);
    const skeletons = container.querySelectorAll('.h-32');
    expect(skeletons.length).toBe(4);
  });

  it('renders 4 stat cards when data is provided', () => {
    const data: DashboardStats = {
      totalOrders: 100,
      todayOrders: 5,
      revenue: 5000,
      todayRevenue: 200,
      activeClients: 30,
      completionRate: 85,
    };

    render(<StatsCards data={data} loading={false} />);

    expect(screen.getByText('statsCards.totalOrders')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('statsCards.revenue')).toBeInTheDocument();
    expect(screen.getByText('statsCards.activeClients')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('statsCards.completionRate')).toBeInTheDocument();
    expect(screen.getByText('85%')).toBeInTheDocument();
  });

  it('formats currency values', () => {
    const data: DashboardStats = {
      totalOrders: 0,
      todayOrders: 0,
      revenue: 1234.56,
      todayRevenue: 100,
      activeClients: 0,
      completionRate: 0,
    };

    render(<StatsCards data={data} loading={false} />);
    expect(screen.getByText('$1234.56')).toBeInTheDocument();
  });

  it('uses default values when data is undefined', () => {
    render(<StatsCards data={undefined} loading={false} />);

    // Multiple '0' elements exist (totalOrders, activeClients, subtitles)
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('shows today count in subtitle', () => {
    const data: DashboardStats = {
      totalOrders: 50,
      todayOrders: 3,
      revenue: 1000,
      todayRevenue: 100,
      activeClients: 10,
      completionRate: 90,
    };

    render(<StatsCards data={data} loading={false} />);
    expect(screen.getByText('3 today')).toBeInTheDocument();
  });
});
