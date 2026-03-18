import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  type MouseEvent,
} from 'react';
import { cn } from '@/shared/utils/cn';

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  onOpenChange,
  children,
  className,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS),
        ).filter((el) => !el.closest('[hidden]'));

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      // Move focus into dialog on open
      requestAnimationFrame(() => {
        if (dialogRef.current) {
          const first =
            dialogRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
          first ? first.focus() : dialogRef.current.focus();
        }
      });
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, handleClose]);

  if (!open) return null;

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === overlayRef.current) handleClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'w-full max-w-lg rounded-lg bg-card p-6 shadow-lg animate-in fade-in zoom-in-95',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mb-4', className)}>{children}</div>;
}

export function DialogTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <h2 className={cn('text-lg font-semibold', className)}>{children}</h2>;
}

export function DialogFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mt-6 flex justify-end gap-3', className)}>
      {children}
    </div>
  );
}

export function DialogContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(className)}>{children}</div>;
}
