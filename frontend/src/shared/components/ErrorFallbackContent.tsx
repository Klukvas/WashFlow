import { useTranslation } from 'react-i18next';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export function ErrorFallbackContent({
  error,
  onReset,
}: {
  error: Error | null;
  onReset: () => void;
}) {
  const { t } = useTranslation('common');

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">
          {t('errors.somethingWentWrong')}
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('errors.unexpectedError')}
        </p>
        {error && import.meta.env.DEV && (
          <p className="max-w-md text-xs text-muted-foreground/70">
            {error.message}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" />
          {t('errors.tryAgain')}
        </button>
        <button
          onClick={() => window.location.assign('/')}
          className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          {t('errors.goToDashboard')}
        </button>
      </div>
    </div>
  );
}
