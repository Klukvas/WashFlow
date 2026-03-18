import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams, Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { resetPassword } from '../api/auth.api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const { mutate, isPending, error } = useMutation({
    mutationFn: (newPassword: string) => resetPassword(token, newPassword),
    onSuccess: () => {
      navigate('/login', { state: { passwordReset: true } });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (password !== confirmPassword) {
      setValidationError(t('changePassword.passwordMismatch'));
      return;
    }

    if (!token) {
      setValidationError(t('resetPasswordPage.invalidToken'));
      return;
    }

    mutate(password);
  };

  const displayError = validationError || (error ? t('resetPasswordPage.error') : '');

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-2 text-3xl font-bold text-primary">WashFlow</div>
          <CardTitle>{t('resetPasswordPage.title')}</CardTitle>
          <CardDescription>{t('resetPasswordPage.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t('changePassword.newPassword')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('changePassword.confirmPassword')}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {displayError && (
              <p className="text-sm text-destructive">{displayError}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t('resetPasswordPage.loading') : t('resetPasswordPage.submit')}
            </Button>
            <div className="text-center">
              <Link
                to="/login"
                className="text-sm text-muted-foreground hover:underline"
              >
                {t('forgotPassword.backToLogin')}
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
