import { useTranslation } from 'react-i18next';

export function LandingFooter() {
  const { t } = useTranslation('landing');

  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
        &copy; {new Date().getFullYear()} {t('footer.copyright')}
      </div>
    </footer>
  );
}
