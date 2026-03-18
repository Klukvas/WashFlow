import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCards } from '../KpiCards';
import type { KpiData } from '../../api/dashboard.api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/utils/format', () => ({
  formatCurrency: (v: number) => `$${v.toFixed(2)}`,
}));

describe('KpiCards', () => {
  it('renders loading skeletons when loading', () => {
    const { container } = render(<KpiCards loading={true} />);
    const skeletons = container.querySelectorAll('.h-28');
    expect(skeletons.length).toBe(6);
  });

  it('renders 6 KPI cards when data is provided', () => {
    const data: KpiData = {
      revenueToday: 500,
      ordersToday: 10,
      avgOrderDuration: 45,
      cancelRateToday: 0.1,
      activeClientsToday: 8,
      occupancyRate: 0.75,
    };

    render(<KpiCards data={data} loading={false} />);

    expect(screen.getByText('kpi.revenueToday')).toBeInTheDocument();
    expect(screen.getByText('kpi.ordersToday')).toBeInTheDocument();
    expect(screen.getByText('kpi.avgOrderDuration')).toBeInTheDocument();
    expect(screen.getByText('kpi.cancelRateToday')).toBeInTheDocument();
    expect(screen.getByText('kpi.activeClientsToday')).toBeInTheDocument();
    expect(screen.getByText('kpi.occupancyRate')).toBeInTheDocument();
  });

  it('formats percentage values correctly', () => {
    const data: KpiData = {
      revenueToday: 0,
      ordersToday: 0,
      avgOrderDuration: 0,
      cancelRateToday: 0.156, // (0.156*100).toFixed(1) = "15.6%"
      activeClientsToday: 0,
      occupancyRate: 83.3, // (83.3).toFixed(1) = "83.3%"
    };

    render(<KpiCards data={data} loading={false} />);

    expect(screen.getByText('15.6%')).toBeInTheDocument();
    expect(screen.getByText('83.3%')).toBeInTheDocument();
  });

  it('uses default values when data is undefined', () => {
    render(<KpiCards data={undefined} loading={false} />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();
    // Both cancelRateToday and occupancyRate render '0.0%'
    const percentages = screen.getAllByText('0.0%');
    expect(percentages.length).toBe(2);
  });

  it('formats currency for revenue', () => {
    const data: KpiData = {
      revenueToday: 1234,
      ordersToday: 5,
      avgOrderDuration: 30,
      cancelRateToday: 0,
      activeClientsToday: 3,
      occupancyRate: 0.5,
    };

    render(<KpiCards data={data} loading={false} />);
    expect(screen.getByText('$1234.00')).toBeInTheDocument();
  });
});
