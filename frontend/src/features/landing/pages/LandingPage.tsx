import { Seo } from '@/shared/components/Seo';
import { LandingHeader } from '../components/LandingHeader';
import { HeroSection } from '../components/HeroSection';
import { FeaturesSection } from '../components/FeaturesSection';
import { ScreenshotsSection } from '../components/ScreenshotsSection';
import { HowItWorksSection } from '../components/HowItWorksSection';
import { StatsSection } from '../components/StatsSection';
import { PricingSection } from '../components/PricingSection';
import { CtaSection } from '../components/CtaSection';
import { LandingFooter } from '../components/LandingFooter';
import { AuthModal } from '@/features/auth/components/AuthModal';

export function LandingPage() {
  return (
    <div className="min-h-full bg-background">
      <Seo />
      <LandingHeader />
      <HeroSection />
      <FeaturesSection />
      <ScreenshotsSection />
      <HowItWorksSection />
      <StatsSection />
      <PricingSection />
      <CtaSection />
      <LandingFooter />
      <AuthModal />
    </div>
  );
}
