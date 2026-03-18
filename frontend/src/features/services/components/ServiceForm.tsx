import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import type { Service } from '@/shared/types/models';

const serviceSchema = z.object({
  name: z.string().min(1, 'validation.nameRequired').max(255),
  description: z.string().max(1000).optional().or(z.literal('')),
  durationMin: z.number().int().min(1, 'validation.durationMin').max(1440),
  price: z.number().min(0, 'validation.priceNonNegative'),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0),
});

export type ServiceFormData = z.infer<typeof serviceSchema>;

interface ServiceFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ServiceFormData) => void;
  service?: Service | null;
  loading?: boolean;
}

export function ServiceForm({
  open,
  onClose,
  onSubmit,
  service,
  loading,
}: ServiceFormProps) {
  const { t } = useTranslation('services');
  const { t: tCommon } = useTranslation('common');
  const isEdit = !!service;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: '',
      description: '',
      durationMin: 30,
      price: 0,
      isActive: true,
      sortOrder: 0,
    },
  });

  useEffect(() => {
    if (open) {
      if (service) {
        reset({
          name: service.name,
          description: service.description ?? '',
          durationMin: service.durationMin,
          price: service.price,
          isActive: service.isActive,
          sortOrder: service.sortOrder,
        });
      } else {
        reset({
          name: '',
          description: '',
          durationMin: 30,
          price: 0,
          isActive: true,
          sortOrder: 0,
        });
      }
    }
  }, [open, service, reset]);

  const handleFormSubmit = (data: ServiceFormData) => {
    onSubmit({
      ...data,
      description: data.description || undefined,
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>
          {isEdit ? t('editService') : t('createService')}
        </DialogTitle>
      </DialogHeader>

      <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
        <div>
          <Label htmlFor="name">{t('fields.name')}</Label>
          <Input
            id="name"
            {...register('name')}
            error={errors.name?.message ? t(errors.name.message) : undefined}
            placeholder={t('placeholders.name')}
          />
        </div>

        <div>
          <Label htmlFor="description">{t('fields.description')}</Label>
          <Input
            id="description"
            {...register('description')}
            error={errors.description?.message}
            placeholder={t('placeholders.description')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="durationMin">{t('fields.duration')}</Label>
            <Input
              id="durationMin"
              type="number"
              min={1}
              {...register('durationMin', { valueAsNumber: true })}
              error={
                errors.durationMin?.message
                  ? t(errors.durationMin.message)
                  : undefined
              }
              placeholder={t('placeholders.duration')}
            />
          </div>

          <div>
            <Label htmlFor="price">{t('fields.price')}</Label>
            <Input
              id="price"
              type="number"
              min={0}
              step="0.01"
              {...register('price', { valueAsNumber: true })}
              error={
                errors.price?.message ? t(errors.price.message) : undefined
              }
              placeholder={t('placeholders.price')}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sortOrder">{t('fields.sortOrder')}</Label>
            <Input
              id="sortOrder"
              type="number"
              min={0}
              {...register('sortOrder', { valueAsNumber: true })}
              error={errors.sortOrder?.message}
            />
          </div>

          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                {...register('isActive')}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
              <span className="text-sm font-medium">
                {t('fields.isActive')}
              </span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            {tCommon('actions.cancel')}
          </Button>
          <Button type="submit" loading={loading} disabled={isEdit && !isDirty}>
            {isEdit ? tCommon('actions.save') : tCommon('actions.create')}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
