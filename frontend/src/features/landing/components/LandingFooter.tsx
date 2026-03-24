import { useTranslation } from 'react-i18next';

export function LandingFooter() {
  const { t } = useTranslation('landing');

  return (
    <footer className="landing-footer">
      <div className="landing-footer-left">
        <a href="#" className="landing-footer-logo">
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
        </a>
        <span className="landing-footer-copy">{t('footer.copyright')}</span>
      </div>
      <div className="landing-footer-links">
        <a href="/blog">{t('footer.blog')}</a>
        <a href="#">{t('footer.privacy')}</a>
        <a href="#">{t('footer.terms')}</a>
      </div>
    </footer>
  );
}
