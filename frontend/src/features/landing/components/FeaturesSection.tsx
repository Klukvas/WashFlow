import { useTranslation } from 'react-i18next';

const FEATURES = [
  { key: 'multiLocation', emoji: '🏢' },
  { key: 'scheduling', emoji: '📅' },
  { key: 'workforce', emoji: '👥' },
  { key: 'realtime', emoji: '⚡' },
  { key: 'booking', emoji: '🌐' },
  { key: 'billing', emoji: '💳' },
  { key: 'analytics', emoji: '📊' },
  { key: 'roles', emoji: '🔒' },
  { key: 'audit', emoji: '📋' },
] as const;

export function FeaturesSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="features" style={{ background: 'var(--bg-base)' }}>
      <div className="landing-container">
        <div className="reveal">
          <div className="landing-section-label">{t('features.label')}</div>
          <h2
            className="landing-section-title"
            dangerouslySetInnerHTML={{ __html: t('features.title') }}
          />
          <p className="landing-section-sub">{t('features.subtitle')}</p>
        </div>
        <div className="landing-features-grid reveal">
          {FEATURES.map(({ key, emoji }) => (
            <div key={key} className="landing-feat-card">
              <div className="landing-feat-icon-wrap">{emoji}</div>
              <div className="landing-feat-title">{t(`features.items.${key}.title`)}</div>
              <div className="landing-feat-desc">{t(`features.items.${key}.desc`)}</div>
              <div className="landing-feat-tag">{t(`features.items.${key}.tag`)}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
