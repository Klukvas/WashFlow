import { useRef } from 'react';
import { HeroWash } from './HeroWash';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';

export function HeroSection() {
  const { t } = useTranslation('landing');
  const openModal = useAuthModalStore((s) => s.open);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const demoRef = useRef<HTMLDialogElement>(null);

  return (
    <section className="landing-hero" aria-labelledby="hero-title">
      <HeroWash />

      <div className="landing-hero-copy">
        <p className="landing-hero-eyebrow">{t('hero.badge')}</p>
        <h1 id="hero-title">
          <span>{t('hero.title')}</span>
          <span className="landing-hero-title-accent">{t('hero.titleAccent')}</span>
        </h1>
        <p className="landing-hero-sub">{t('hero.subtitle')}</p>
        <div className="landing-hero-ctas">
          {isAuthenticated ? (
            <Link to="/dashboard" className="btn-lg-accent">
              {t('header.goToPlatform')} <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <button type="button" className="btn-lg-accent" onClick={() => openModal('register')}>
              {t('hero.cta')} <span aria-hidden="true">↗</span>
            </button>
          )}
          <button type="button" className="btn-lg-ghost" onClick={() => demoRef.current?.showModal()}>
            {t('hero.demoCta')}
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M3 9h18M9 9v11" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
        <p className="landing-hero-note">{t('hero.note')}</p>
      </div>

      <figure className="landing-hero-sample" id="hero-product-demo">
        <figcaption>{t('hero.sampleLabel')}</figcaption>
        <div className="landing-hero-sample-heading">
          <span>{t('hero.sampleTitle')}</span><span className="landing-hero-sample-time">14:00–14:30</span>
        </div>
        <div className="landing-hero-sample-order">
          <div className="landing-hero-sample-bay">{t('hero.sampleBay')}</div>
          <div><strong>{t('hero.sampleVehicle')}</strong><span>{t('hero.sampleService')}</span></div>
          <span className="landing-hero-sample-status">{t('hero.sampleStatus')}</span>
        </div>
      </figure>

      <dialog
        ref={demoRef}
        className="landing-hero-demo"
        aria-labelledby="hero-demo-title"
        aria-describedby="hero-demo-description"
        onKeyDown={(event) => {
          if (event.key !== 'Tab') return;
          const controls = event.currentTarget.querySelectorAll<HTMLElement>('button, [tabindex="0"]');
          const first = controls[0];
          const last = controls[controls.length - 1];
          if ((!event.shiftKey && document.activeElement === last) || (event.shiftKey && document.activeElement === first)) {
            event.preventDefault();
            (event.shiftKey ? last : first)?.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) demoRef.current?.close();
        }}
      >
        <div className="landing-hero-demo-content">
          <div className="landing-hero-demo-header">
            <div>
              <h2 id="hero-demo-title">{t('hero.demoTitle')}</h2>
              <p id="hero-demo-description">{t('hero.demoDescription')}</p>
            </div>
            <button type="button" autoFocus onClick={() => demoRef.current?.close()} aria-label={t('hero.closeDemo')}>
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="landing-hero-demo-image" tabIndex={0} role="region" aria-label={t('hero.demoAlt')}>
            <img src="/screenshots/orders.png" width={2556} height={769} loading="lazy" alt={t('hero.demoAlt')} />
          </div>
        </div>
      </dialog>
    </section>
  );
}
