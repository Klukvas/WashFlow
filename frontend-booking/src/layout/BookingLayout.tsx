import { Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/ui/button';

export function BookingLayout() {
  const { i18n, t } = useTranslation('public-booking');

  function toggleLang() {
    const next = i18n.language === 'en' ? 'uk' : 'en';
    i18n.changeLanguage(next);
  }

  return (
    <div className="min-h-full bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <span className="text-lg font-bold text-primary">WashFlow</span>
          <Button variant="ghost" size="sm" onClick={toggleLang}>
            {t('langToggle')}
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
