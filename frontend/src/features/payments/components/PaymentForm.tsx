import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentMethod } from '@/shared/types/enums';
import { moneyCents, decimalMoney, displayMoney } from '@/shared/utils/money';
import { useCreatePayment } from '../hooks/usePayments';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

interface PaymentFormProps {
  orderId: string;
  maxAmount?: string;
  disabled?: boolean;
  onSuccess?: () => void;
}
export function PaymentForm({
  orderId,
  maxAmount,
  disabled,
  onSuccess,
}: PaymentFormProps) {
  const { t } = useTranslation('orders');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [reference, setReference] = useState('');
  const [invalid, setInvalid] = useState(false);
  const lock = useRef(false);
  const mutation = useCreatePayment(orderId);
  const validAmount =
    /^\d+(?:\.\d{1,2})?$/.test(amount) &&
    moneyCents(amount) > 0n &&
    (maxAmount === undefined || moneyCents(amount) <= moneyCents(maxAmount));
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (disabled || mutation.isPending || lock.current) return;
    if (!validAmount) {
      setInvalid(true);
      return;
    }
    lock.current = true;
    mutation.mutate(
      {
        amount: Number(decimalMoney(moneyCents(amount))),
        method,
        ...(reference ? { reference } : {}),
      },
      {
        onSuccess: () => {
          setAmount('');
          setReference('');
          setInvalid(false);
          onSuccess?.();
        },
        onSettled: () => {
          lock.current = false;
        },
      },
    );
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`payment-amount-${orderId}`}>
            {t('payment.amount')}
          </Label>
          <Input
            id={`payment-amount-${orderId}`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={disabled || mutation.isPending}
            placeholder={maxAmount}
          />
          {maxAmount && (
            <p className="mt-1 text-xs text-muted-foreground">
              {t('payment.maximum')}: {displayMoney(maxAmount)}
            </p>
          )}
        </div>
        <div>
          <Label htmlFor={`payment-method-${orderId}`}>
            {t('payment.methodLabel')}
          </Label>
          <Select
            id={`payment-method-${orderId}`}
            value={method}
            onChange={(e) => {
              const value = e.target.value;
              if (Object.values(PaymentMethod).some((m) => m === value))
                setMethod(value as PaymentMethod);
            }}
            disabled={disabled || mutation.isPending}
            options={Object.values(PaymentMethod).map((value) => ({
              value,
              label: t(`payment.method.${value}`),
            }))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`payment-reference-${orderId}`}>
          {t('payment.reference')}
        </Label>
        <Input
          id={`payment-reference-${orderId}`}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          disabled={disabled || mutation.isPending}
          maxLength={255}
        />
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-destructive">
          {t('payment.invalid')}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={disabled || !validAmount}
        loading={mutation.isPending}
      >
        {t('payment.record')}
      </Button>
    </form>
  );
}
