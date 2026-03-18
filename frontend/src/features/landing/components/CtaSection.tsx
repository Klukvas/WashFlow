import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';
import { Button } from '@/shared/ui/button';

export function CtaSection() {
  const { t } = useTranslation('landing');
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t('cta.title')}
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          {t('cta.subtitle')}
        </p>
        <div className="mt-8">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => openModal('register')}
          >
            {t('cta.button')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </section>
  );
}
