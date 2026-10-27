import { Building2, CalendarDays, Users, Zap, Globe, CreditCard, ChartColumn, ShieldCheck, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const FEATURES = [
  { key: 'multiLocation', icon: Building2 },
  { key: 'scheduling', icon: CalendarDays },
  { key: 'workforce', icon: Users },
  { key: 'realtime', icon: Zap },
  { key: 'booking', icon: Globe },
  { key: 'billing', icon: CreditCard },
  { key: 'analytics', icon: ChartColumn },
  { key: 'roles', icon: ShieldCheck },
  { key: 'audit', icon: ClipboardList },
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
          {FEATURES.map(({ key, icon: Icon }) => (
            <div key={key} className="landing-feat-card">
              <div className="landing-feat-icon-wrap"><Icon size={22} strokeWidth={1.75} aria-hidden="true" focusable="false" style={{ color: 'var(--accent)', flexShrink: 0 }} /></div>
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
