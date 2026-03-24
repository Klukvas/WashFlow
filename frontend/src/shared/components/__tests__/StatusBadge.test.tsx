import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from '../StatusBadge';
import { OrderStatus } from '@/shared/types/enums';
import { ORDER_STATUS_CONFIG } from '@/shared/constants/order-status';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('StatusBadge', () => {
  it('renders the translated status text', () => {
    render(<StatusBadge status={OrderStatus.BOOKED} />);
    expect(screen.getByText('status.BOOKED')).toBeInTheDocument();
  });

  it('applies the correct background and text color classes for BOOKED', () => {
    const { container } = render(<StatusBadge status={OrderStatus.BOOKED} />);
    const span = container.querySelector('span')!;
    const config = ORDER_STATUS_CONFIG[OrderStatus.BOOKED];
    expect(span.className).toContain(config.bgColor);
    expect(span.className).toContain(config.color);
  });

  it('applies base styling classes', () => {
    const { container } = render(
      <StatusBadge status={OrderStatus.COMPLETED} />,
    );
    const span = container.querySelector('span')!;
    expect(span.className).toContain('inline-flex');
    expect(span.className).toContain('rounded-full');
    expect(span.className).toContain('text-xs');
    expect(span.className).toContain('font-medium');
  });

  it('merges a custom className when provided', () => {
    const { container } = render(
      <StatusBadge status={OrderStatus.BOOKED} className="ml-2" />,
    );
    const span = container.querySelector('span')!;
    expect(span.className).toContain('ml-2');
  });

  it('renders correctly for each OrderStatus value', () => {
    const statuses: OrderStatus[] = [
      OrderStatus.BOOKED_PENDING_CONFIRMATION,
      OrderStatus.BOOKED,
      OrderStatus.IN_PROGRESS,
      OrderStatus.COMPLETED,
      OrderStatus.CANCELLED,
      OrderStatus.NO_SHOW,
    ];

    for (const status of statuses) {
      const { container, unmount } = render(<StatusBadge status={status} />);
      const span = container.querySelector('span')!;
      const config = ORDER_STATUS_CONFIG[status];

      expect(screen.getByText(`status.${status}`)).toBeInTheDocument();
      expect(span.className).toContain(config.bgColor);
      expect(span.className).toContain(config.color);

      unmount();
    }
  });

  it('renders CANCELLED with destructive color classes', () => {
    const { container } = render(
      <StatusBadge status={OrderStatus.CANCELLED} />,
    );
    const span = container.querySelector('span')!;
    expect(span.className).toContain('text-destructive');
    expect(span.className).toContain('bg-destructive/10');
  });

  it('renders IN_PROGRESS with primary color classes', () => {
    const { container } = render(
      <StatusBadge status={OrderStatus.IN_PROGRESS} />,
    );
    const span = container.querySelector('span')!;
    expect(span.className).toContain('text-primary');
  });
});
