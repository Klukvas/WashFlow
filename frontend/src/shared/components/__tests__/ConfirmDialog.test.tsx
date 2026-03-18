import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from '../ConfirmDialog';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/shared/ui/dialog', () => ({
  Dialog: ({ open, children }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogHeader: ({ children }: any) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: any) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
}));

vi.mock('@/shared/ui/button', () => ({
  Button: ({ children, onClick, disabled, loading, variant, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      data-variant={variant}
      data-loading={loading}
      {...props}
    >
      {children}
    </button>
  ),
}));

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: 'Confirm Action',
  message: 'Are you sure?',
};

describe('ConfirmDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ConfirmDialog {...defaultProps} open={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog when open is true', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog')).toBeInTheDocument();
  });

  it('displays the title', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByTestId('dialog-title')).toHaveTextContent('Confirm Action');
  });

  it('displays the message', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('Are you sure?')).toBeInTheDocument();
  });

  it('renders a cancel button with translated text', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('actions.cancel')).toBeInTheDocument();
  });

  it('renders a confirm button with default translated text', () => {
    render(<ConfirmDialog {...defaultProps} />);
    expect(screen.getByText('actions.confirm')).toBeInTheDocument();
  });

  it('renders a confirm button with custom confirmLabel', () => {
    render(<ConfirmDialog {...defaultProps} confirmLabel="Delete it" />);
    expect(screen.getByText('Delete it')).toBeInTheDocument();
    expect(screen.queryByText('actions.confirm')).not.toBeInTheDocument();
  });

  it('calls onClose when the cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByText('actions.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('actions.confirm'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses default variant for the confirm button by default', () => {
    render(<ConfirmDialog {...defaultProps} />);
    const confirmButton = screen.getByText('actions.confirm');
    expect(confirmButton).toHaveAttribute('data-variant', 'default');
  });

  it('applies destructive variant to the confirm button when variant is destructive', () => {
    render(<ConfirmDialog {...defaultProps} variant="destructive" />);
    const confirmButton = screen.getByText('actions.confirm');
    expect(confirmButton).toHaveAttribute('data-variant', 'destructive');
  });

  it('disables the cancel button when loading is true', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    const cancelButton = screen.getByText('actions.cancel');
    expect(cancelButton).toBeDisabled();
  });

  it('disables the confirm button when loading is true', () => {
    render(<ConfirmDialog {...defaultProps} loading={true} />);
    const confirmButton = screen.getByText('actions.confirm');
    expect(confirmButton).toBeDisabled();
  });

  it('does not disable buttons when loading is false', () => {
    render(<ConfirmDialog {...defaultProps} loading={false} />);
    const cancelButton = screen.getByText('actions.cancel');
    const confirmButton = screen.getByText('actions.confirm');
    expect(cancelButton).not.toBeDisabled();
    expect(confirmButton).not.toBeDisabled();
  });
});
