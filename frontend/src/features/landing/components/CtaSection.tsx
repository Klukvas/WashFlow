import { useTranslation } from 'react-i18next';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';

export function CtaSection() {
  const { t } = useTranslation('landing');
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <section className="landing-cta-section">
      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="landing-section-label" style={{ marginBottom: 20 }}>
          {t('cta.label')}
        </div>
        <h2 dangerouslySetInnerHTML={{ __html: t('cta.title') }} />
        <p>{t('cta.subtitle')}</p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn-lg-accent"
            onClick={() => openModal('register')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12h14M12 5l7 7-7 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {t('cta.button')}
          </button>
          <a href="/blog" className="btn-lg-ghost">
            {t('cta.secondary')}
          </a>
        </div>
        <div className="landing-cta-trial-note">{t('cta.note')}</div>
      </div>
    </section>
  );
}
