import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/shared/stores/auth.store';
import { useAuthModalStore } from '@/shared/stores/auth-modal.store';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';

export function LandingHeader() {
  const { t } = useTranslation('landing');
  const { pathname, hash, key } = useLocation();

  // `key` changes on every navigation, so re-clicking the same section scrolls again.
  useEffect(() => {
    if (pathname === '/' && hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView();
    }
  }, [pathname, hash, key]);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openModal = useAuthModalStore((s) => s.open);

  return (
    <nav className="landing-nav" aria-label="WashFlow">
      <Link to="/" className="landing-nav-logo">
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
      </Link>

      <ul className="landing-nav-links">
        <li>
          <Link to="/#features">{t('nav.features')}</Link>
        </li>
        <li>
          <Link to="/#how">{t('nav.howItWorks')}</Link>
        </li>
        <li>
          <Link to="/#pricing">{t('nav.pricing')}</Link>
        </li>
        <li>
          <Link to="/#realtime">{t('nav.realtime')}</Link>
        </li>
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
              className="btn-sm-accent landing-nav-register"
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
