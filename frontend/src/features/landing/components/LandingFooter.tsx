import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function LandingFooter() {
  const { t } = useTranslation('landing');

  return (
    <footer className="landing-footer">
      <div className="landing-footer-left">
        <Link to="/" className="landing-footer-logo">
          <div className="landing-footer-logo-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path
                d="M3 13h2l2 5 4-10 3 7 2-4h5"
                stroke="#0B0F17"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          WashFlow
        </Link>
        <span className="landing-footer-copy">{t('footer.copyright')}</span>
      </div>
      <div className="landing-footer-links">
        <Link to="/blog">{t('footer.blog')}</Link>
        <Link to="/legal/privacy">{t('footer.privacy')}</Link>
        <Link to="/legal/terms">{t('footer.terms')}</Link>
        <Link to="/legal/refund">{t('footer.refund')}</Link>
      </div>
    </footer>
  );
}
