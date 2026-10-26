import type { ReactNode } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/shared/ui/button';
import type { Fact } from '../model';

export function FactRow({
  name,
  description,
  fact,
  action,
}: {
  name: string;
  description: string;
  fact: Fact;
  action?: ReactNode;
}) {
  const { t } = useTranslation('dashboard');
  const Icon =
    fact.state === 'complete'
      ? Check
      : fact.state === 'loading'
        ? Loader2
        : Circle;
  return (
    <li
      className="flex flex-wrap items-start gap-4 border-b border-border p-5 last:border-0"
      data-state={fact.state}
    >
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/25 text-primary">
        <Icon
          aria-hidden="true"
          className={`h-4 w-4 ${fact.state === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''}`}
        />
      </span>
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="font-semibold">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="mt-2 text-sm" role="status">
          {t(`setup.states.${fact.state}`)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {fact.state === 'error' ? (
          <Button variant="outline" onClick={fact.retry}>
            {t('setup.retry')}
          </Button>
        ) : (
          action
        )}
      </div>
    </li>
  );
}
