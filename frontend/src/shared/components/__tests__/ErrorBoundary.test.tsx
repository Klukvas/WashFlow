import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  AlertTriangle: (props: any) => (
    <svg data-testid="alert-triangle-icon" {...props} />
  ),
  RotateCcw: (props: any) => <svg data-testid="rotate-ccw-icon" {...props} />,
}));

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Child content</div>;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <div>Normal content</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders the default error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders "Try Again" button in the default error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('renders "Go to Dashboard" button in the default error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
  });

  it('renders the custom fallback instead of the default error UI', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('logs the error to console.error via componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(consoleErrorSpy).toHaveBeenCalled();
    const loggedArgs = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) => call[0] === '[ErrorBoundary] Uncaught error:',
    );
    expect(loggedArgs).toBeDefined();
  });

  it('passes the Error object to componentDidCatch', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    const loggedArgs = consoleErrorSpy.mock.calls.find(
      (call: unknown[]) => call[0] === '[ErrorBoundary] Uncaught error:',
    );
    expect(loggedArgs).toBeDefined();
    expect(loggedArgs![1]).toBeInstanceOf(Error);
    expect(loggedArgs![1].message).toBe('Test error message');
  });

  it('resets the error state and re-renders children when "Try Again" is clicked', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Try Again'));

    expect(screen.getByText('Child content')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('navigates to dashboard when "Go to Dashboard" is clicked', () => {
    const assignMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock },
      writable: true,
      configurable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('Go to Dashboard'));
    expect(assignMock).toHaveBeenCalledWith('/');
  });

  it('renders the descriptive paragraph in the default error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(
      screen.getByText(
        'An unexpected error occurred. Please try refreshing the page.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the AlertTriangle icon in the default error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('alert-triangle-icon')).toBeInTheDocument();
  });

  it('renders the RotateCcw icon inside the "Try Again" button', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('rotate-ccw-icon')).toBeInTheDocument();
  });

  describe('dev mode error message', () => {
    const originalDev = import.meta.env.DEV;

    afterEach(() => {
      import.meta.env.DEV = originalDev;
    });

    it('shows the error message in DEV mode', () => {
      import.meta.env.DEV = true;

      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.getByText('Test error message')).toBeInTheDocument();
    });

    it('hides the error message in production mode', () => {
      import.meta.env.DEV = false;

      render(
        <ErrorBoundary>
          <ThrowingChild shouldThrow={true} />
        </ErrorBoundary>,
      );

      expect(screen.queryByText('Test error message')).not.toBeInTheDocument();
    });
  });
});
