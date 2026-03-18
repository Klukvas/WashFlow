import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SoftDeleteBadge } from '../SoftDeleteBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/ui/badge', () => ({
  Badge: ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <span data-testid="badge" {...props}>
      {children}
    </span>
  ),
}));

describe('SoftDeleteBadge', () => {
  it('renders nothing when deletedAt is null', () => {
    const { container } = render(<SoftDeleteBadge deletedAt={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the badge when deletedAt has a value', () => {
    render(<SoftDeleteBadge deletedAt="2026-01-15T10:00:00Z" />);
    expect(screen.getByTestId('badge')).toBeInTheDocument();
  });

  it('displays the translated deletedBadge text', () => {
    render(<SoftDeleteBadge deletedAt="2026-01-15T10:00:00Z" />);
    expect(screen.getByText('softDelete.deletedBadge')).toBeInTheDocument();
  });

  it('passes the destructive variant to Badge', () => {
    render(<SoftDeleteBadge deletedAt="2026-01-15T10:00:00Z" />);
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveAttribute('variant', 'destructive');
  });

  it('renders nothing when deletedAt is an empty string (falsy)', () => {
    const { container } = render(
      <SoftDeleteBadge deletedAt={'' as unknown as string | null} />,
    );
    expect(container.innerHTML).toBe('');
  });
});
