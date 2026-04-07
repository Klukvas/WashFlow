import { Outlet } from 'react-router';
import { LandingHeader } from '@/features/landing/components/LandingHeader';
import { LandingFooter } from '@/features/landing/components/LandingFooter';
import { AuthModal } from '@/features/auth/components/AuthModal';
import '@/features/landing/landing.css';
import '../legal.css';

export function LegalLayout() {
  return (
    <div className="landing bg-grid">
      <LandingHeader />
      <main className="legal-page">
        <Outlet />
      </main>
      <LandingFooter />
      <AuthModal />
    </div>
  );
}
