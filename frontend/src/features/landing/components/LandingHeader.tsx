import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';
import { Link } from 'react-router';

export function LandingHeader() {
  const { t } = useTranslation('landing');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <nav className="landing-nav">
      <a href="#" className="landing-nav-logo">
        <div className="landing-nav-logo-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path
              d="M3 13h2l2 5 4-10 3 7 2-4h5"
              stroke="#0B0F17"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        WashFlow
      </a>

      <ul className="landing-nav-links">
        <li><a href="#features">{t('nav.features')}</a></li>
        <li><a href="#how">{t('nav.howItWorks')}</a></li>
        <li><a href="#pricing">{t('nav.pricing')}</a></li>
        <li><a href="#realtime">{t('nav.realtime')}</a></li>
      </ul>

      <div className="landing-nav-actions">
        {isAuthenticated ? (
          <Link to="/dashboard" className="btn-sm-accent">
            {t('header.goToPlatform')}
          </Link>
        ) : (
          <>
            <button
              type="button"
              className="btn-sm-ghost"
              onClick={() => openModal('login')}
            >
              {t('header.signIn')}
            </button>
            <button
              type="button"
              className="btn-sm-accent"
              onClick={() => openModal('register')}
            >
              {t('header.startTrial')}
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
