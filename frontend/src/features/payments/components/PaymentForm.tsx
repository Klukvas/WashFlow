import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PaymentMethod } from '@/shared/types/enums';
import { useCreatePayment } from '../hooks/usePayments';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

const paymentMethodValues = Object.values(PaymentMethod) as [PaymentMethod, ...PaymentMethod[]];

const paymentSchema = z.object({
  amount: z.number().min(0.01),
  method: z.enum(paymentMethodValues),
  reference: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentFormProps {
  orderId: string;
  onSuccess?: () => void;
}

export function PaymentForm({ orderId, onSuccess }: PaymentFormProps) {
  const { t } = useTranslation('common');
  const { mutate, isPending } = useCreatePayment(orderId);
  const { register, handleSubmit, reset, formState: { errors } } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: PaymentMethod.CASH },
  });

  const methodOptions = Object.values(PaymentMethod).map((m) => ({
    value: m,
    label: m.charAt(0) + m.slice(1).toLowerCase(),
  }));

  const onSubmit = (data: PaymentFormData) => {
    mutate(data, {
      onSuccess: () => {
        reset();
        onSuccess?.();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Amount</Label>
          <Input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        </div>
        <div>
          <Label>Method</Label>
          <Select options={methodOptions} {...register('method')} error={errors.method?.message} />
        </div>
      </div>
      <div>
        <Label>Reference</Label>
        <Input {...register('reference')} placeholder="Optional reference" />
      </div>
      <Button type="submit" size="sm" loading={isPending}>
        {t('actions.save')}
      </Button>
    </form>
  );
}
