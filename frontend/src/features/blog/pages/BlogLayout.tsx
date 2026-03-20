import { Outlet } from 'react-router';
import { LandingHeader } from '@/features/landing/components/LandingHeader';
import { LandingFooter } from '@/features/landing/components/LandingFooter';
import { AuthModal } from '@/features/auth/components/AuthModal';

export function BlogLayout() {
  return (
    <div className="min-h-full bg-background">
      <LandingHeader />
      <main>
        <Outlet />
      </main>
      <LandingFooter />
      <AuthModal />
    </div>
  );
}
