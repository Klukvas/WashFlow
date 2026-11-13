import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { EmployeePerformanceTable } from '../EmployeePerformanceTable';
import type { EmployeePerformance } from '../../api/dashboard.api';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/shared/components/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: ReactNode }) => children,
}));

function employee(employeeId: string, cancelRate: number): EmployeePerformance {
  return { employeeId, name: employeeId, branch: 'Main', orders: 145, revenue: 1000, cancelRate };
}

describe('EmployeePerformanceTable', () => {
  it('displays API percentage points once, including both boundaries', () => {
    render(<EmployeePerformanceTable data={[employee('a', 13.2), employee('b', 0), employee('c', 100)]} loading={false} />);
    expect(screen.getByText('13.2%')).toBeInTheDocument();
    expect(screen.getByText('0.0%')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
    expect(screen.queryByText('1320.0%')).not.toBeInTheDocument();
  });

  it('preserves employee row identity across a reordered refresh without duplicate-key warnings', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const a = employee('a', 13.2);
      const b = employee('b', 5);
      const { rerender } = render(<EmployeePerformanceTable data={[a, b]} loading={false} />);
      const rowA = screen.getByText('a').closest('tr');
      rerender(<EmployeePerformanceTable data={[{ ...b, orders: 160 }, { ...a, orders: 150 }]} loading={false} />);
      expect(screen.getByText('a').closest('tr')).toBe(rowA);
      expect(within(screen.getAllByRole('row')[1]).getByText('b')).toBeInTheDocument();
      expect(within(screen.getAllByRole('row')[2]).getByText('150')).toBeInTheDocument();
      expect(errors.mock.calls.filter((call) => call.some((arg) => String(arg).includes('same key')))).toEqual([]);
    } finally {
      errors.mockRestore();
    }
  });
});
