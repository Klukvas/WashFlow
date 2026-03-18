import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IncludeDeletedToggle } from '../IncludeDeletedToggle';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('IncludeDeletedToggle', () => {
  it('renders a checkbox input', () => {
    render(<IncludeDeletedToggle checked={false} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('displays the translated label text', () => {
    render(<IncludeDeletedToggle checked={false} onChange={vi.fn()} />);
    expect(screen.getByText('softDelete.showDeleted')).toBeInTheDocument();
  });

  it('reflects checked=false as unchecked', () => {
    render(<IncludeDeletedToggle checked={false} onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('reflects checked=true as checked', () => {
    render(<IncludeDeletedToggle checked={true} onChange={vi.fn()} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('calls onChange with true when an unchecked checkbox is clicked', () => {
    const handleChange = vi.fn();
    render(<IncludeDeletedToggle checked={false} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when a checked checkbox is clicked', () => {
    const handleChange = vi.fn();
    render(<IncludeDeletedToggle checked={true} onChange={handleChange} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it('renders inside a label element for accessibility', () => {
    const { container } = render(
      <IncludeDeletedToggle checked={false} onChange={vi.fn()} />,
    );
    const label = container.querySelector('label');
    expect(label).not.toBeNull();
    expect(label!.querySelector('input[type="checkbox"]')).not.toBeNull();
  });

  it('applies cursor-pointer class to the label', () => {
    const { container } = render(
      <IncludeDeletedToggle checked={false} onChange={vi.fn()} />,
    );
    const label = container.querySelector('label')!;
    expect(label.className).toContain('cursor-pointer');
  });
});
