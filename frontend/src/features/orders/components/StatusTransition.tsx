import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OrderStatus } from '@/shared/types/enums';
import { ALLOWED_TRANSITIONS } from '@/shared/constants/order-status';
import { useUpdateOrderStatus } from '../hooks/useOrders';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

interface StatusTransitionProps {
  orderId: string;
  currentStatus: OrderStatus;
}

const STATUS_BUTTON_CONFIG: Partial<
  Record<
    OrderStatus,
    {
      labelKey: string;
      variant: 'default' | 'destructive' | 'success' | 'secondary';
    }
  >
> = {
  [OrderStatus.BOOKED_PENDING_CONFIRMATION]: {
    labelKey: 'statusChange.pendingConfirmation',
    variant: 'secondary',
  },
  [OrderStatus.BOOKED]: {
    labelKey: 'statusChange.confirm',
    variant: 'success',
  },
  [OrderStatus.IN_PROGRESS]: {
    labelKey: 'statusChange.start',
    variant: 'default',
  },
  [OrderStatus.COMPLETED]: {
    labelKey: 'statusChange.complete',
    variant: 'success',
  },
  [OrderStatus.CANCELLED]: {
    labelKey: 'statusChange.cancelOrder',
    variant: 'destructive',
  },
  [OrderStatus.NO_SHOW]: {
    labelKey: 'statusChange.noShow',
    variant: 'secondary',
  },
};

export function StatusTransition({
  orderId,
  currentStatus,
}: StatusTransitionProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const { mutate, isPending } = useUpdateOrderStatus();

  const allowedStatuses = ALLOWED_TRANSITIONS[currentStatus];

  if (allowedStatuses.length === 0) return null;

  function handleTransition(newStatus: OrderStatus) {
    if (newStatus === OrderStatus.CANCELLED) {
      setCancelDialogOpen(true);
      return;
    }
    mutate({ id: orderId, status: newStatus });
  }

  function handleCancelConfirm() {
    mutate(
      { id: orderId, status: OrderStatus.CANCELLED, cancellationReason },
      { onSuccess: () => setCancelDialogOpen(false) },
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {allowedStatuses.map((status) => {
          const config = STATUS_BUTTON_CONFIG[status];
          if (!config) return null;
          return (
            <Button
              key={status}
              variant={config.variant}
              size="sm"
              onClick={() => handleTransition(status)}
              loading={isPending}
            >
              {t(config.labelKey)}
            </Button>
          );
        })}
      </div>

      <Dialog
        open={cancelDialogOpen}
        onClose={() => setCancelDialogOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>{t('statusChange.cancelOrder')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>{t('statusChange.cancellationReason')}</Label>
          <Input
            value={cancellationReason}
            onChange={(e) => setCancellationReason(e.target.value)}
            placeholder={t('statusChange.cancellationReason')}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
            {tc('actions.close')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancelConfirm}
            loading={isPending}
          >
            {t('statusChange.cancelOrder')}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
