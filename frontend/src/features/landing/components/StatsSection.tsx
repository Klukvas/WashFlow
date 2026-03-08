import { useTranslation } from 'react-i18next';

const stats = [
  { key: 'orders', value: '50,000+' },
  { key: 'branches', value: '200+' },
  { key: 'uptime', value: '99.9%' },
  { key: 'languages', value: '2' },
] as const;

export function StatsSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="bg-primary py-16 text-primary-foreground">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-10 text-center text-2xl font-bold sm:text-3xl">
          {t('stats.title')}
        </h2>
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.map(({ key, value }) => (
            <div key={key} className="text-center">
              <div className="text-3xl font-bold sm:text-4xl">{value}</div>
              <div className="mt-1 text-sm opacity-80">{t(`stats.${key}`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
