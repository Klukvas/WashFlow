import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import { RegisterForm } from '../components/RegisterForm';
import { useAuthStore } from '@/shared/stores/auth.store';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';

export function RegisterPage() {
  const { t } = useTranslation('auth');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#090E18] p-4">
      {/* Grid texture */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(56,189,248,0.09) 0%, transparent 70%)',
        }}
      />

      <div className="absolute right-4 top-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="relative z-10 w-full max-w-[400px]">
        {/* Logo */}
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="inline-block text-3xl font-extrabold tracking-tight"
            style={{
              background: 'linear-gradient(135deg, #38BDF8 30%, #7DD3FC 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            WashFlow
          </Link>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border p-8"
          style={{
            background: '#0F1623',
            borderColor: 'rgba(255,255,255,0.07)',
            boxShadow:
              '0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          <div className="mb-6 text-center">
            <h1 className="text-xl font-bold text-[#F1F5F9]">
              {t('register.title')}
            </h1>
            <p className="mt-1 text-sm text-[#94A3B8]">
              {t('register.subtitle')}
            </p>
          </div>

          <RegisterForm />
        </div>
      </div>
    </div>
  );
}
