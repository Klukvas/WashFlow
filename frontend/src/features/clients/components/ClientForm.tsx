import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { Client } from '@/shared/types/models';

const clientSchema = z.object({
  firstName: z.string().min(1, 'required').max(100),
  lastName: z.string().max(100).optional().or(z.literal('')),
  phone: z
    .string()
    .regex(/^\+?[\d\s\-()]{7,20}$/, 'invalidPhone')
    .optional()
    .or(z.literal('')),
  email: z.string().email('invalidEmail').max(255).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type ClientFormValues = z.infer<typeof clientSchema>;

interface ClientFormProps {
  client?: Client;
  onSubmit: (values: ClientFormValues) => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ClientForm({
  client,
  onSubmit,
  onCancel,
  loading,
}: ClientFormProps) {
  const { t } = useTranslation('common');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      notes: '',
    },
  });

  useEffect(() => {
    if (client) {
      reset({
        firstName: client.firstName,
        lastName: client.lastName ?? '',
        phone: client.phone ?? '',
        email: client.email ?? '',
        notes: client.notes ?? '',
      });
    }
  }, [client, reset]);

  const handleFormSubmit = (values: ClientFormValues) => {
    const payload = {
      ...values,
      lastName: values.lastName || null,
      phone: values.phone || null,
      email: values.email || null,
      notes: values.notes || null,
    };
    onSubmit(payload as ClientFormValues);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('fields.firstName')}</Label>
          <Input
            id="firstName"
            {...register('firstName')}
            error={
              errors.firstName
                ? t(`validation.${errors.firstName.message}`)
                : undefined
            }
            placeholder={t('fields.firstName')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">{t('fields.lastName')}</Label>
          <Input
            id="lastName"
            {...register('lastName')}
            error={
              errors.lastName
                ? t(`validation.${errors.lastName.message}`)
                : undefined
            }
            placeholder={t('fields.lastName')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">{t('fields.phone')}</Label>
          <Input
            id="phone"
            type="tel"
            {...register('phone')}
            error={
              errors.phone ? t(`validation.${errors.phone.message}`) : undefined
            }
            placeholder="+380 XX XXX XX XX"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">{t('fields.email')}</Label>
          <Input
            id="email"
            type="email"
            {...register('email')}
            error={
              errors.email ? t(`validation.${errors.email.message}`) : undefined
            }
            placeholder={t('fields.email')}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t('fields.notes')}</Label>
        <Input
          id="notes"
          {...register('notes')}
          error={
            errors.notes ? t(`validation.${errors.notes.message}`) : undefined
          }
          placeholder={t('fields.notes')}
        />
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" loading={loading} disabled={!isDirty && !!client}>
          {client ? t('actions.save') : t('actions.create')}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          {t('actions.cancel')}
        </Button>
      </div>
    </form>
  );
}
