import { useTranslation } from 'react-i18next';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';

interface Plan {
  key: string;
  popular?: boolean;
}

const PLANS: Plan[] = [
  { key: 'starter' },
  { key: 'business', popular: true },
  { key: 'enterprise' },
];

export function PricingSection() {
  const { t } = useTranslation('landing');
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <section
      id="pricing"
      style={{ padding: '96px 24px', borderTop: '1px solid var(--border)' }}
    >
      <div className="landing-container">
        <div style={{ textAlign: 'center' }} className="reveal">
          <div className="landing-section-label">{t('pricing.label')}</div>
          <h2 className="landing-section-title">{t('pricing.title')}</h2>
          <p className="landing-section-sub" style={{ margin: '0 auto' }}>
            {t('pricing.subtitle')}
          </p>
        </div>

        <div className="landing-pricing-grid reveal">
          {PLANS.map(({ key, popular }) => {
            const rawFeatures = t(`pricing.plans.${key}.features`, {
              returnObjects: true,
            });
            const rawNaFeatures = t(`pricing.plans.${key}.naFeatures`, {
              returnObjects: true,
              defaultValue: [],
            });
            const features = Array.isArray(rawFeatures)
              ? (rawFeatures as string[])
              : [];
            const naFeatures = Array.isArray(rawNaFeatures)
              ? (rawNaFeatures as string[])
              : [];

            return (
              <div
                key={key}
                className={`landing-plan-card${popular ? ' popular' : ''}`}
              >
                {popular && (
                  <div className="landing-plan-popular-badge">
                    {t('pricing.popular')}
                  </div>
                )}
                <div className="landing-plan-name">
                  {t(`pricing.plans.${key}.name`)}
                </div>
                <div className="landing-plan-desc">
                  {t(`pricing.plans.${key}.desc`)}
                </div>
                <div className="landing-plan-price">
                  <span className="landing-plan-amount">
                    {t(`pricing.plans.${key}.price`)}
                  </span>
                  <span className="landing-plan-period">
                    {t('pricing.period')}
                  </span>
                </div>
                <ul className="landing-plan-features">
                  {features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                  {naFeatures.map((f) => (
                    <li key={f} className="na">
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`landing-plan-btn${popular ? ' accent' : ''}`}
                  onClick={() => openModal('register')}
                >
                  {t(`pricing.plans.${key}.cta`)}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: 28 }}>
          <span
            style={{
              fontSize: 12,
              fontFamily: "'DM Mono', monospace",
              color: 'var(--text-tertiary)',
            }}
          >
            {t('pricing.note')}
          </span>
        </div>
      </div>
    </section>
  );
}
