import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';

export type CheckoutStatus = 'idle' | 'processing' | 'success' | 'error';

interface CheckoutResultDialogProps {
  status: CheckoutStatus;
  fromTier?: string;
  onClose: () => void;
}

export function CheckoutResultDialog({
  status,
  fromTier,
  onClose,
}: CheckoutResultDialogProps) {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();

  if (status === 'idle') return null;

  return (
    <Dialog open onClose={onClose} dismissable={status !== 'processing'}>
      {status === 'processing' && (
        <>
          <DialogHeader className="sr-only">
            <DialogTitle>{t('checkout.processing')}</DialogTitle>
          </DialogHeader>
          <DialogContent className="flex flex-col items-center py-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              {t('checkout.processing')}
            </p>
          </DialogContent>
        </>
      )}

      {status === 'success' && (
        <>
          <DialogHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <DialogTitle>{t('checkout.successTitle')}</DialogTitle>
          </DialogHeader>
          <DialogContent className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('checkout.successMessage')}
            </p>
          </DialogContent>
          <DialogFooter className="justify-center">
            <Button
              onClick={() => {
                onClose();
                navigate('/subscription', {
                  state: { activated: true, fromTier },
                });
              }}
            >
              {t('checkout.successButton')}
            </Button>
          </DialogFooter>
        </>
      )}

      {status === 'error' && (
        <>
          <DialogHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle>{t('checkout.errorTitle')}</DialogTitle>
          </DialogHeader>
          <DialogContent className="text-center">
            <p className="text-sm text-muted-foreground">
              {t('checkout.errorMessage')}
            </p>
          </DialogContent>
          <DialogFooter className="justify-center">
            <Button variant="outline" onClick={onClose}>
              {t('checkout.errorButton')}
            </Button>
          </DialogFooter>
        </>
      )}
    </Dialog>
  );
}
