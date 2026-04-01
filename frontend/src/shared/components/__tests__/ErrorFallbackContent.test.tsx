import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorFallbackContent } from '../ErrorFallbackContent';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

describe('ErrorFallbackContent', () => {
  const mockOnReset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders error heading and description', () => {
    render(<ErrorFallbackContent error={null} onReset={mockOnReset} />);

    expect(screen.getByText('errors.somethingWentWrong')).toBeInTheDocument();
    expect(screen.getByText('errors.unexpectedError')).toBeInTheDocument();
  });

  it('renders try-again and go-to-dashboard buttons', () => {
    render(<ErrorFallbackContent error={null} onReset={mockOnReset} />);

    expect(screen.getByText('errors.tryAgain')).toBeInTheDocument();
    expect(screen.getByText('errors.goToDashboard')).toBeInTheDocument();
  });

  it('calls onReset when try-again button is clicked', async () => {
    const user = userEvent.setup();
    render(<ErrorFallbackContent error={null} onReset={mockOnReset} />);

    await user.click(screen.getByText('errors.tryAgain'));
    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });

  it('navigates to / when go-to-dashboard is clicked', async () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock },
      writable: true,
      configurable: true,
    });

    const user = userEvent.setup();
    render(<ErrorFallbackContent error={null} onReset={mockOnReset} />);

    await user.click(screen.getByText('errors.goToDashboard'));
    expect(assignMock).toHaveBeenCalledWith('/');
  });

  it('does not show error message when error is null', () => {
    render(<ErrorFallbackContent error={null} onReset={mockOnReset} />);

    // Only the generic messages should be shown
    expect(screen.getByText('errors.somethingWentWrong')).toBeInTheDocument();
  });
});
