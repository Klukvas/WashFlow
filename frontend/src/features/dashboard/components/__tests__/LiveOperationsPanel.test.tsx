import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveOperationsPanel } from '../LiveOperationsPanel';
import type { LiveOperations } from '../../api/dashboard.api';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('LiveOperationsPanel', () => {
  it('renders loading skeleton when loading', () => {
    const { container } = render(<LiveOperationsPanel loading={true} />);
    expect(container.querySelector('.h-40')).toBeInTheDocument();
  });

  it('renders stat cells with data', () => {
    const data: LiveOperations = {
      inProgressCount: 3,
      waitingCount: 2,
      freeWorkPosts: 5,
      overdueOrders: 1,
    };

    render(<LiveOperationsPanel data={data} loading={false} />);

    expect(screen.getByText('live.title')).toBeInTheDocument();
    expect(screen.getByText('live.inProgress')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('live.waiting')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('live.freeWorkPosts')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('live.overdue')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('uses default values when data is undefined', () => {
    render(<LiveOperationsPanel data={undefined} loading={false} />);

    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(4);
  });

  it('uses destructive variant for overdue when count > 0', () => {
    const data: LiveOperations = {
      inProgressCount: 0,
      waitingCount: 0,
      freeWorkPosts: 0,
      overdueOrders: 3,
    };

    const { container } = render(
      <LiveOperationsPanel data={data} loading={false} />,
    );

    // The badge containing the overdue count should have destructive variant
    const badges = container.querySelectorAll('[class*="destructive"]');
    expect(badges.length).toBeGreaterThan(0);
  });
});
