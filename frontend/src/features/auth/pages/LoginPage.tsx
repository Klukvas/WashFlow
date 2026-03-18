import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { LoginForm } from '../components/LoginForm';
import { useAuthStore } from '@/shared/stores/auth.store';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';

function getSafeRedirect(from: string | null | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//')) {
    return '/dashboard';
  }
  return from;
}

export function LoginPage() {
  const { t } = useTranslation('auth');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const location = useLocation();
  const from = getSafeRedirect((location.state as { from?: string })?.from);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-2 text-3xl font-bold text-primary">WashFlow</div>
          <CardTitle>{t('login.title')}</CardTitle>
          <CardDescription>{t('login.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
