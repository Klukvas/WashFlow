import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useRegister } from '../hooks/useRegister';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import type { AxiosError } from 'axios';

const registerSchema = z
  .object({
    companyName: z.string().min(2),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { t } = useTranslation('auth');
  const { mutate, isPending, error } = useRegister();

  const {
    register: reg,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = (data: RegisterFormData) => {
    const { confirmPassword: _, ...payload } = data;
    mutate(payload);
  };

  const isConflict =
    (error as AxiosError | null)?.response?.status === 409;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="companyName">{t('register.companyName')}</Label>
        <Input
          id="companyName"
          error={errors.companyName?.message}
          {...reg('companyName')}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t('register.firstName')}</Label>
          <Input
            id="firstName"
            error={errors.firstName?.message}
            {...reg('firstName')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t('register.lastName')}</Label>
          <Input
            id="lastName"
            error={errors.lastName?.message}
            {...reg('lastName')}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('register.email')}</Label>
        <Input
          id="email"
          type="email"
          error={errors.email?.message}
          {...reg('email')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">{t('register.password')}</Label>
        <Input
          id="password"
          type="password"
          error={errors.password?.message}
          {...reg('password')}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">{t('register.confirmPassword')}</Label>
        <Input
          id="confirmPassword"
          type="password"
          error={
            errors.confirmPassword
              ? t('register.passwordMismatch')
              : undefined
          }
          {...reg('confirmPassword')}
        />
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {isConflict ? t('register.emailInUse') : t('register.error')}
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        loading={isPending}
        data-testid="register-submit"
      >
        {isPending ? t('register.loading') : t('register.submit')}
      </Button>
    </form>
  );
}
