import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { Role } from '@/shared/types/models';

const roleSchema = z.object({
  name: z
    .string()
    .min(1, 'validation.required')
    .max(100, 'validation.maxLength'),
  description: z.string().max(500, 'validation.maxLength').optional().or(z.literal('')),
});

type RoleFormData = z.infer<typeof roleSchema>;

interface RoleFormProps {
  role?: Role;
  onSubmit: (data: RoleFormData) => void;
  isPending?: boolean;
}

export function RoleForm({ role, onSubmit, isPending }: RoleFormProps) {
  const { t } = useTranslation('roles');
  const { t: tc } = useTranslation('common');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<RoleFormData>({
    resolver: zodResolver(roleSchema),
    defaultValues: {
      name: role?.name ?? '',
      description: role?.description ?? '',
    },
  });

  useEffect(() => {
    if (role) {
      reset({
        name: role.name,
        description: role.description ?? '',
      });
    }
  }, [role, reset]);

  const handleFormSubmit = (data: RoleFormData) => {
    onSubmit({
      name: data.name,
      description: data.description || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">{t('fields.name')}</Label>
        <Input
          id="name"
          placeholder={t('placeholders.name')}
          error={errors.name?.message ? tc(errors.name.message) : undefined}
          {...register('name')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">{t('fields.description')}</Label>
        <Input
          id="description"
          placeholder={t('placeholders.description')}
          error={
            errors.description?.message
              ? tc(errors.description.message)
              : undefined
          }
          {...register('description')}
        />
      </div>

      <Button type="submit" loading={isPending} disabled={!isDirty}>
        <Save className="h-4 w-4" />
        {role ? tc('actions.save') : tc('actions.create')}
      </Button>
    </form>
  );
}
