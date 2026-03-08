import { useTranslation } from 'react-i18next';

const steps = ['register', 'configure', 'launch'] as const;

export function HowItWorksSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="py-20">
      <div className="mx-auto max-w-5xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('howItWorks.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('howItWorks.subtitle')}
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((step) => (
            <div key={step} className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-2xl font-bold text-primary-foreground">
                {t(`howItWorks.steps.${step}.step`)}
              </div>
              <h3 className="mt-4 text-lg font-semibold">
                {t(`howItWorks.steps.${step}.title`)}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`howItWorks.steps.${step}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
