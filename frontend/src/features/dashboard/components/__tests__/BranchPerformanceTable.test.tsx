import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { BranchPerformanceTable } from '../BranchPerformanceTable';
import type { BranchPerformance } from '../../api/dashboard.api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/shared/hooks/useBranchScope', () => ({
  useBranchScope: () => ({ isBranchScoped: false }),
}));

function branch(branchId: string): BranchPerformance {
  return {
    branchId,
    name: branchId,
    orders: 5,
    revenue: 1000,
    avgCheck: 200,
    loadRate: 40,
  };
}

describe('branch performance row identity', () => {
  it('preserves branch rows after reordering refreshed objects without duplicate keys', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const a = branch('Central');
      const b = branch('Leftbank');
      const { rerender } = render(
        <BranchPerformanceTable data={[a, b]} loading={false} />,
      );
      const rowA = screen.getByText('Central').closest('tr');
      rerender(
        <BranchPerformanceTable
          data={[
            { ...b, orders: 7 },
            { ...a, orders: 9 },
          ]}
          loading={false}
        />,
      );
      expect(screen.getByText('Central').closest('tr')).toBe(rowA);
      expect(
        within(screen.getAllByRole('row')[1]).getByText('Leftbank'),
      ).toBeInTheDocument();
      expect(
        within(screen.getAllByRole('row')[2]).getByText('9'),
      ).toBeInTheDocument();
      expect(
        errors.mock.calls.filter((call) =>
          call.some((arg) => String(arg).includes('same key')),
        ),
      ).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});
