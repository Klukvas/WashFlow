import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useLogin } from '../hooks/useLogin';
import { Input } from '@/shared/ui/input';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

type LoginFormData = z.infer<typeof loginSchema>;

interface LoginFormProps {
  onSwitchToRegister?: () => void;
}

export function LoginForm({ onSwitchToRegister }: LoginFormProps) {
  const { t } = useTranslation('auth');
  const { mutate, isPending, error } = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormData) => mutate(data);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-[13px] font-medium text-[#94A3B8]"
        >
          {t('login.email')}
        </label>
        <Input
          id="email"
          type="email"
          placeholder="email@example.com"
          error={errors.email?.message}
          className="h-11 rounded-lg border-[rgba(255,255,255,0.07)] bg-[#111828] text-[#F1F5F9] placeholder:text-[#475569] focus-visible:ring-[#38BDF8]/40 focus-visible:border-[rgba(56,189,248,0.3)]"
          {...register('email')}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-[13px] font-medium text-[#94A3B8]"
        >
          {t('login.password')}
        </label>
        <Input
          id="password"
          type="password"
          error={errors.password?.message}
          className="h-11 rounded-lg border-[rgba(255,255,255,0.07)] bg-[#111828] text-[#F1F5F9] placeholder:text-[#475569] focus-visible:ring-[#38BDF8]/40 focus-visible:border-[rgba(56,189,248,0.3)]"
          {...register('password')}
        />
      </div>

      {error && <p className="text-sm text-destructive">{t('login.error')}</p>}

      <button
        type="submit"
        disabled={isPending}
        data-testid="login-submit"
        className="flex w-full items-center justify-center rounded-lg px-6 py-2.5 text-[14px] font-semibold transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        style={{
          background: '#38BDF8',
          color: '#0B0F17',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.88')}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
      >
        {isPending ? t('login.loading') : t('login.submit')}
      </button>

      <div className="text-center">
        <Link
          to="/forgot-password"
          className="text-[13px] text-[#94A3B8] transition-colors hover:text-[#38BDF8]"
        >
          {t('login.forgotPassword')}
        </Link>
      </div>

      {onSwitchToRegister && (
        <div className="text-center text-[13px]">
          <span className="text-[#94A3B8]">{t('login.noAccount')}</span>{' '}
          <button
            type="button"
            onClick={onSwitchToRegister}
            className="font-medium text-[#38BDF8] transition-colors hover:text-[#7DD3FC]"
          >
            {t('login.registerLink')}
          </button>
        </div>
      )}
    </form>
  );
}
