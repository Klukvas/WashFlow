import {
  type ReactNode,
  useEffect,
  useRef,
  useCallback,
  useContext,
  createContext,
  useId,
  type MouseEvent,
} from 'react';
import { cn } from '@/shared/utils/cn';

const FOCUSABLE_SELECTORS =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface DialogContextValue {
  titleId: string;
}

const DialogContext = createContext<DialogContextValue>({ titleId: '' });

interface DialogProps {
  open: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  /** When false, Escape key and overlay click will not close the dialog. */
  dismissable?: boolean;
  children: ReactNode;
  className?: string;
}

export function Dialog({
  open,
  onClose,
  onOpenChange,
  dismissable = true,
  children,
  className,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<Element | null>(null);
  const didLockScrollRef = useRef(false);
  const titleId = useId();

  const handleClose = useCallback(() => {
    onClose?.();
    onOpenChange?.(false);
  }, [onClose, onOpenChange]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && dismissable) {
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
      previousFocusRef.current = document.activeElement;
      document.addEventListener('keydown', handleKeyDown);

      // Only lock scroll if not already locked (prevents breaking nested dialogs)
      if (!document.body.style.overflow) {
        document.body.style.overflow = 'hidden';
        didLockScrollRef.current = true;
      }

      // Move focus into dialog on open
      requestAnimationFrame(() => {
        if (dialogRef.current) {
          const first =
            dialogRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTORS);
          if (first) {
            first.focus();
          } else {
            dialogRef.current.focus();
          }
        }
      });
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (didLockScrollRef.current) {
        document.body.style.overflow = '';
        didLockScrollRef.current = false;
      }
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus();
      }
    };
  }, [open, handleClose, dismissable]);

  if (!open) return null;

  function handleOverlayClick(e: MouseEvent) {
    if (dismissable && e.target === overlayRef.current) handleClose();
  }

  return (
    <DialogContext.Provider value={{ titleId }}>
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        onClick={handleOverlayClick}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className={cn(
            'w-full max-w-lg rounded-lg bg-card p-6 shadow-lg animate-in fade-in zoom-in-95',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </DialogContext.Provider>
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
  const { titleId } = useContext(DialogContext);
  return (
    <h2 id={titleId} className={cn('text-lg font-semibold', className)}>
      {children}
    </h2>
  );
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
