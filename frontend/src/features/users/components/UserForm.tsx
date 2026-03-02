import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/shared/api/client';
import type { PaginatedApiResponse } from '@/shared/types/api';
import type { User, Branch, Role } from '@/shared/types/models';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Select } from '@/shared/ui/select';

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().optional().or(z.literal('')),
  branchId: z.string().optional().or(z.literal('')),
  roleId: z.string().optional().or(z.literal('')),
});

const updateUserSchema = createUserSchema.extend({
  password: z.string().min(8).optional().or(z.literal('')),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;
type UpdateUserFormData = z.infer<typeof updateUserSchema>;
type UserFormData = CreateUserFormData | UpdateUserFormData;

interface UserFormProps {
  user?: User | null;
  onSubmit: (data: UserFormData) => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function UserForm({ user, onSubmit, onCancel, isPending }: UserFormProps) {
  const { t } = useTranslation('common');
  const isEditing = !!user;

  const schema = isEditing ? updateUserSchema : createUserSchema;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
      branchId: '',
      roleId: '',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        email: user.email,
        password: '',
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? '',
        branchId: user.branchId ?? '',
        roleId: user.roleId ?? '',
      });
    }
  }, [user, reset]);

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Branch>>(
        '/branches',
        { params: { limit: 100 } },
      );
      return data.data;
    },
    staleTime: Infinity,
  });

  const { data: roles } = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data } = await apiClient.get<PaginatedApiResponse<Role>>(
        '/roles',
        { params: { limit: 100 } },
      );
      return data.data;
    },
    staleTime: Infinity,
  });

  const handleFormSubmit = (data: UserFormData) => {
    const cleaned = { ...data };

    if (!cleaned.phone) delete cleaned.phone;
    if (!cleaned.branchId) delete cleaned.branchId;
    if (!cleaned.roleId) delete cleaned.roleId;
    if (isEditing && !cleaned.password) delete cleaned.password;

    onSubmit(cleaned);
  };

  const branchOptions = (branches ?? []).map((b) => ({
    value: b.id,
    label: b.name,
  }));

  const roleOptions = (roles ?? []).map((r) => ({
    value: r.id,
    label: r.name,
  }));

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('fields.firstName')}</Label>
          <Input
            id="firstName"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName">{t('fields.lastName')}</Label>
          <Input
            id="lastName"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('fields.email')}</Label>
        <Input
          id="email"
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">
          {t('fields.password')}
          {isEditing && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              ({t('fields.passwordOptional')})
            </span>
          )}
        </Label>
        <Input
          id="password"
          type="password"
          error={errors.password?.message}
          {...register('password')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">{t('fields.phone')}</Label>
        <Input
          id="phone"
          type="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="branchId">{t('fields.branch')}</Label>
          <Select
            id="branchId"
            options={branchOptions}
            placeholder={t('fields.selectBranch')}
            error={errors.branchId?.message}
            {...register('branchId')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="roleId">{t('fields.role')}</Label>
          <Select
            id="roleId"
            options={roleOptions}
            placeholder={t('fields.selectRole')}
            error={errors.roleId?.message}
            {...register('roleId')}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {t('actions.cancel')}
        </Button>
        <Button type="submit" loading={isPending}>
          {isEditing ? t('actions.save') : t('actions.create')}
        </Button>
      </div>
    </form>
  );
}
