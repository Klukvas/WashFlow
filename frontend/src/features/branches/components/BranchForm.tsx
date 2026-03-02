import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { Branch } from '@/shared/types/models';

const branchSchema = z.object({
  name: z.string().min(1, 'validation.required').max(255, 'validation.maxLength'),
  address: z.string().max(500, 'validation.maxLength').optional().or(z.literal('')),
  phone: z
    .string()
    .max(30, 'validation.maxLength')
    .optional()
    .or(z.literal('')),
});

export type BranchFormData = z.infer<typeof branchSchema>;

interface BranchFormProps {
  branch?: Branch | null;
  onSubmit: (data: BranchFormData) => void;
  isPending?: boolean;
  onCancel?: () => void;
}

export function BranchForm({ branch, onSubmit, isPending, onCancel }: BranchFormProps) {
  const { t } = useTranslation('branches');
  const { t: tc } = useTranslation('common');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: branch?.name ?? '',
      address: branch?.address ?? '',
      phone: branch?.phone ?? '',
    },
  });

  useEffect(() => {
    if (branch) {
      reset({
        name: branch.name,
        address: branch.address ?? '',
        phone: branch.phone ?? '',
      });
    }
  }, [branch, reset]);

  const handleFormSubmit = (data: BranchFormData) => {
    onSubmit({
      name: data.name,
      address: data.address || undefined,
      phone: data.phone || undefined,
    });
  };

  const isEdit = !!branch;

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('fields.name')} *</Label>
        <Input
          id="name"
          placeholder={t('placeholders.name')}
          error={errors.name?.message ? t(errors.name.message) : undefined}
          {...register('name')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">{t('fields.address')}</Label>
        <Input
          id="address"
          placeholder={t('placeholders.address')}
          error={errors.address?.message ? t(errors.address.message) : undefined}
          {...register('address')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{t('fields.phone')}</Label>
        <Input
          id="phone"
          type="tel"
          placeholder={t('placeholders.phone')}
          error={errors.phone?.message ? t(errors.phone.message) : undefined}
          {...register('phone')}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            {tc('actions.cancel')}
          </Button>
        )}
        <Button type="submit" loading={isPending} disabled={isEdit && !isDirty}>
          {isEdit ? tc('actions.save') : tc('actions.create')}
        </Button>
      </div>
    </form>
  );
}
