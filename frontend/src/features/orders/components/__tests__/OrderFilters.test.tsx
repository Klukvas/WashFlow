import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderFilters } from '../OrderFilters';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/ui/select', () => ({
  Select: ({
    placeholder,
    value,
    onChange,
    options,
  }: {
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
    options?: { value: string; label: string }[];
  }) => (
    <select
      data-testid={`select-${placeholder}`}
      value={value}
      onChange={onChange}
    >
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@/shared/ui/date-picker', () => ({
  DatePicker: ({
    placeholder,
    value,
    onChange,
  }: {
    placeholder?: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input
      data-testid={`date-${placeholder}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/shared/components/IncludeDeletedToggle', () => ({
  IncludeDeletedToggle: ({
    checked,
    onChange,
  }: {
    checked: boolean;
    onChange: (v: boolean) => void;
  }) => (
    <input
      type="checkbox"
      data-testid="include-deleted"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  ),
}));

const defaultProps = {
  filters: {},
  branches: [
    { id: 'b1', name: 'Branch 1' },
    { id: 'b2', name: 'Branch 2' },
  ] as { id: string; name: string }[],
  onChange: vi.fn(),
  onReset: vi.fn(),
};

describe('OrderFilters', () => {
  it('renders status filter', () => {
    render(<OrderFilters {...defaultProps} />);
    expect(screen.getByTestId('select-filters.status')).toBeInTheDocument();
  });

  it('renders branch filter by default', () => {
    render(<OrderFilters {...defaultProps} />);
    expect(screen.getByTestId('select-filters.branch')).toBeInTheDocument();
  });

  it('hides branch filter when hideBranchFilter=true', () => {
    render(<OrderFilters {...defaultProps} hideBranchFilter={true} />);
    expect(
      screen.queryByTestId('select-filters.branch'),
    ).not.toBeInTheDocument();
  });

  it('reset button calls onReset', async () => {
    const user = userEvent.setup();
    render(<OrderFilters {...defaultProps} />);

    await user.click(screen.getByText('actions.reset'));
    expect(defaultProps.onReset).toHaveBeenCalled();
  });

  it('renders date filters', () => {
    render(<OrderFilters {...defaultProps} />);
    expect(screen.getByTestId('date-filters.dateFrom')).toBeInTheDocument();
    expect(screen.getByTestId('date-filters.dateTo')).toBeInTheDocument();
  });

  it('renders include deleted toggle', () => {
    render(<OrderFilters {...defaultProps} />);
    expect(screen.getByTestId('include-deleted')).toBeInTheDocument();
  });
});
