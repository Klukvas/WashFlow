import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useMutation } from '@tanstack/react-query';
import { forgotPassword } from '../api/auth.api';
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

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { mutate, isPending } = useMutation({
    mutationFn: (emailValue: string) => forgotPassword(emailValue),
    onSettled: () => {
      // Always show success — don't reveal if email exists
      setSubmitted(true);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutate(email);
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-background p-4">
      <div className="absolute right-4 top-4 flex gap-2">
        <ThemeToggle />
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mb-2 text-3xl font-bold text-primary">WashFlow</div>
          <CardTitle>{t('forgotPassword.title')}</CardTitle>
          <CardDescription>{t('forgotPassword.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                {t('forgotPassword.success')}
              </p>
              <Link
                to="/login"
                className="text-sm font-medium text-primary hover:underline"
              >
                {t('forgotPassword.backToLogin')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{t('login.email')}</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isPending}>
                {isPending ? t('forgotPassword.loading') : t('forgotPassword.submit')}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
