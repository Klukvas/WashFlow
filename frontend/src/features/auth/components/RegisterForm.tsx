import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { useRegister } from '../hooks/useRegister';
import { Input } from '@/shared/ui/input';
import type { AxiosError } from 'axios';

const registerSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

interface RegisterFormProps {
  onSwitchToLogin?: () => void;
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { confirmPassword, ...payload } = data;
    mutate(payload);
  };

  const isConflict = (error as AxiosError | null)?.response?.status === 409;

  const inputClassName =
    'h-11 rounded-lg border-[rgba(255,255,255,0.07)] bg-[#111828] text-[#F1F5F9] placeholder:text-[#475569] focus-visible:ring-[#38BDF8]/40 focus-visible:border-[rgba(56,189,248,0.3)]';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-[13px] font-medium text-[#94A3B8]"
        >
          {t('register.email')}
        </label>
        <Input
          id="email"
          type="email"
          placeholder="email@example.com"
          error={errors.email?.message}
          className={inputClassName}
          {...reg('email')}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-[13px] font-medium text-[#94A3B8]"
        >
          {t('register.password')}
        </label>
        <Input
          id="password"
          type="password"
          error={errors.password?.message}
          className={inputClassName}
          {...reg('password')}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirmPassword"
          className="block text-[13px] font-medium text-[#94A3B8]"
        >
          {t('register.confirmPassword')}
        </label>
        <Input
          id="confirmPassword"
          type="password"
          error={
            errors.confirmPassword ? t('register.passwordMismatch') : undefined
          }
          className={inputClassName}
          {...reg('confirmPassword')}
        />
      </div>

      {error && (
        <p className="text-sm text-[#F87171]">
          {isConflict ? t('register.emailInUse') : t('register.error')}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        data-testid="register-submit"
        className="flex w-full items-center justify-center rounded-lg px-6 py-2.5 text-[14px] font-semibold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        style={{
          background: '#38BDF8',
          color: '#0B0F17',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.opacity = '0.88')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.opacity = '1')
        }
      >
        {isPending ? t('register.loading') : t('register.submit')}
      </button>

      {onSwitchToLogin && (
        <div className="text-center text-[13px]">
          <span className="text-[#94A3B8]">
            {t('register.hasAccount')}
          </span>{' '}
          <button
            type="button"
            onClick={onSwitchToLogin}
            className="font-medium text-[#38BDF8] transition-colors hover:text-[#7DD3FC]"
          >
            {t('register.signIn')}
          </button>
        </div>
      )}
    </form>
  );
}
