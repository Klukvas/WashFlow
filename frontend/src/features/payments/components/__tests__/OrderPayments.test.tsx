import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OrderPayments } from '../OrderPayments';
import type { Order } from '@/shared/types/models';

const state = vi.hoisted(() => ({
  mutate: vi.fn(),
  fetching: false,
  create: true,
  payments: [
    { id: 'p1', amount: '0.10', status: 'PAID' },
    { id: 'p2', amount: '0.20', status: 'PENDING' },
  ],
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/shared/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasPermission: () => state.create }),
}));
vi.mock('../../hooks/usePayments', () => ({
  usePayments: () => ({ data: state.payments, isFetching: state.fetching }),
  useCreatePayment: () => ({ mutate: state.mutate, isPending: false }),
}));
vi.mock('../PaymentsList', () => ({ PaymentsList: () => <div>history</div> }));
const order = {
  id: 'o1',
  totalPrice: '1.00',
  status: 'IN_PROGRESS',
} as unknown as Order;

describe('order payments', () => {
  beforeEach(() => {
    state.mutate.mockReset();
    state.fetching = false;
    state.create = true;
  });
  it('separates PAID receipts, unpaid balance and the backend cap reserved by every status', () => {
    render(<OrderPayments order={order} />);
    expect(screen.getByText('0.10 ₴')).toBeInTheDocument();
    expect(screen.getByText('0.90 ₴')).toBeInTheDocument();
    expect(screen.getByText('payment.partial')).toBeInTheDocument();
    const amount = screen.getByLabelText('payment.amount');
    fireEvent.change(amount, { target: { value: '0.71' } });
    expect(
      screen.getByRole('button', { name: 'payment.record' }),
    ).toBeDisabled();
    fireEvent.change(amount, { target: { value: '0.70' } });
    fireEvent.click(screen.getByRole('button', { name: 'payment.record' }));
    expect(state.mutate).toHaveBeenCalledWith(
      { amount: 0.7, method: 'CASH' },
      expect.anything(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'payment.record' }));
    expect(state.mutate).toHaveBeenCalledTimes(1);
  });
  it.each(['COMPLETED', 'CANCELLED', 'NO_SHOW'] as const)(
    'keeps history but hides new payment for %s',
    (status) => {
      render(<OrderPayments order={{ ...order, status }} />);
      expect(screen.getByText('history')).toBeInTheDocument();
      expect(screen.queryByLabelText('payment.amount')).not.toBeInTheDocument();
      expect(screen.getByText('payment.closed')).toBeInTheDocument();
    },
  );
  it('gates payment create separately and disables collection while payment totals refetch', () => {
    state.create = false;
    const view = render(<OrderPayments order={order} />);
    expect(screen.queryByLabelText('payment.amount')).not.toBeInTheDocument();
    state.create = true;
    state.fetching = true;
    view.rerender(<OrderPayments order={order} />);
    expect(screen.getByLabelText('payment.amount')).toBeDisabled();
  });
});
