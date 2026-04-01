import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../ThemeToggle';

const mockSetTheme = vi.fn();
let mockTheme = 'light';

vi.mock('@/shared/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: mockTheme,
    setTheme: mockSetTheme,
  }),
}));

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTheme = 'light';
  });

  it('renders a button with aria-label', () => {
    render(<ThemeToggle />);
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Switch to dark theme');
  });

  it('cycles from light to dark', async () => {
    mockTheme = 'light';
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('cycles from dark to system', async () => {
    mockTheme = 'dark';
    const user = userEvent.setup();
    render(<ThemeToggle />);

    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Switch to system theme',
    );
    await user.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('system');
  });

  it('cycles from system to light', async () => {
    mockTheme = 'system';
    const user = userEvent.setup();
    render(<ThemeToggle />);

    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'Switch to light theme',
    );
    await user.click(screen.getByRole('button'));
    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });
});
