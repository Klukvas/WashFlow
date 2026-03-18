import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';
import { ThemeToggle } from '@/shared/components/ThemeToggle';
import { LanguageSwitcher } from '@/shared/components/LanguageSwitcher';
import { Button } from '@/shared/ui/button';

export function LandingHeader() {
  const { t } = useTranslation('landing');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex flex-col">
          <span className="text-xl font-bold leading-tight text-primary">
            WashFlow
          </span>
          <span className="text-[10px] leading-tight text-muted-foreground">
            Powered by FluxLab
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
          {isAuthenticated ? (
            <Link to="/dashboard">
              <Button size="sm">{t('header.goToPlatform')}</Button>
            </Link>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => openModal('login')}
              >
                {t('header.signIn')}
              </Button>
              <Button size="sm" onClick={() => openModal('register')}>
                {t('header.getStarted')}
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
