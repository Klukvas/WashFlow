import { useCallback, useEffect, useRef, useState } from 'react';
import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { useCreateCheckout } from '../hooks/useSubscription';
import type { PlanTier, BillingInterval } from '../api/subscription.api';

const DEFAULT_SANDBOX = import.meta.env.VITE_PADDLE_SANDBOX === 'true';

interface CheckoutButtonProps {
  planTier: PlanTier;
  billingInterval: BillingInterval;
  clientToken: string;
  sandbox?: boolean;
  onSuccess?: () => void;
  onClose?: () => void;
  children?: React.ReactNode;
}

export function CheckoutButton({
  planTier,
  billingInterval,
  clientToken,
  sandbox = DEFAULT_SANDBOX,
  onSuccess,
  onClose,
  children,
}: CheckoutButtonProps) {
  const { t } = useTranslation('subscription');
  const paddleRef = useRef<Paddle | null>(null);
  const checkout = useCreateCheckout();
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientToken) return;

    initializePaddle({
      token: clientToken,
      environment: sandbox ? 'sandbox' : 'production',
      eventCallback: (event) => {
        if (event.name === 'checkout.completed') {
          onSuccess?.();
        }
        if (event.name === 'checkout.closed') {
          onClose?.();
        }
      },
    }).then((paddle) => {
      paddleRef.current = paddle ?? null;
    });
  }, [clientToken, sandbox, onSuccess, onClose]);

  const handleClick = useCallback(async () => {
    setCheckoutError(null);
    try {
      const result = await checkout.mutateAsync({
        planTier,
        billingInterval,
      });

      if (paddleRef.current && result.transactionId) {
        paddleRef.current.Checkout.open({
          transactionId: result.transactionId,
        });
      }
    } catch (error) {
      console.error('Checkout failed:', error);
      setCheckoutError(t('checkout.error'));
    }
  }, [checkout, planTier, billingInterval, t]);

  return (
    <div>
      <Button onClick={handleClick} disabled={checkout.isPending}>
        {children ?? t('checkout.subscribe')}
      </Button>
      {checkoutError && (
        <p className="mt-2 text-sm text-destructive">{checkoutError}</p>
      )}
    </div>
  );
}
