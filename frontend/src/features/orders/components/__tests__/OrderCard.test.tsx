import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderCard } from '../OrderCard';
import type { Order } from '@/shared/types/models';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/utils/format', () => ({
  formatDateTime: (v: string) => `dt:${v}`,
  formatCurrency: (v: number) => `$${v}`,
}));

vi.mock('../StatusBadge', () => ({
  StatusBadge: ({ status }: { status: string }) => (
    <span data-testid="status-badge">{status}</span>
  ),
}));

vi.mock('@/shared/components/SoftDeleteBadge', () => ({
  SoftDeleteBadge: () => null,
}));

const baseOrder: Order = {
  id: 'order-1',
  tenantId: 'tenant-1',
  branchId: 'branch-1',
  clientId: 'client-1',
  vehicleId: 'vehicle-1',
  status: 'BOOKED',
  scheduledStart: '2026-01-15T10:00:00Z',
  totalPrice: 150,
  source: 'INTERNAL',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  deletedAt: null,
  client: { id: 'c1', firstName: 'John', lastName: 'Doe' } as Order['client'],
  vehicle: { licensePlate: 'AA1234BB' } as Order['vehicle'],
  branch: { id: 'b1', name: 'Main Branch' } as Order['branch'],
  services: [{ id: 's1' }, { id: 's2' }] as Order['services'],
};

describe('OrderCard', () => {
  it('renders client name', () => {
    render(<OrderCard order={baseOrder} onClick={vi.fn()} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders license plate', () => {
    render(<OrderCard order={baseOrder} onClick={vi.fn()} />);
    expect(screen.getByText('AA1234BB')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<OrderCard order={baseOrder} onClick={vi.fn()} />);
    expect(screen.getByTestId('status-badge')).toHaveTextContent('BOOKED');
  });

  it('formats scheduled date', () => {
    render(<OrderCard order={baseOrder} onClick={vi.fn()} />);
    expect(screen.getByText('dt:2026-01-15T10:00:00Z')).toBeInTheDocument();
  });

  it('shows branch name', () => {
    render(<OrderCard order={baseOrder} onClick={vi.fn()} />);
    expect(screen.getByText('Main Branch')).toBeInTheDocument();
  });

  it('formats total price', () => {
    render(<OrderCard order={baseOrder} onClick={vi.fn()} />);
    expect(screen.getByText('$150')).toBeInTheDocument();
  });

  it('calls onClick handler', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<OrderCard order={baseOrder} onClick={onClick} />);

    await user.click(screen.getByText('John Doe'));
    expect(onClick).toHaveBeenCalled();
  });
});
