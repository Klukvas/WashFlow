import { useTranslation } from 'react-i18next';
import { FluxLabBadge } from './FluxLabBadge';

export function LandingFooter() {
  const { t } = useTranslation('landing');

  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center text-sm text-muted-foreground">
        <span>
          &copy; {new Date().getFullYear()} {t('footer.copyright')}
        </span>
        <FluxLabBadge />
      </div>
    </footer>
  );
}
