import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Settings2 } from 'lucide-react';

export function SetupEntry() {
  const { t } = useTranslation('dashboard');
  return (
    <Link
      to="/setup"
      className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-primary/25 bg-primary/5 p-5 text-sm transition-colors hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <div className="flex items-center gap-4">
        <Settings2 className="h-6 w-6 shrink-0 text-primary" />
        <div>
          <h2 className="text-base font-semibold text-foreground">
            {t('setup.entry')}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {t('setup.entryDescription')}
          </p>
        </div>
      </div>
      <ArrowRight className="h-5 w-5 shrink-0 text-primary" />
    </Link>
  );
}
