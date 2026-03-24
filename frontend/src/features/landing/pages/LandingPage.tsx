import { Seo } from '@/shared/components/Seo';
import { LandingHeader } from '../components/LandingHeader';
import { HeroSection } from '../components/HeroSection';
import { FeaturesSection } from '../components/FeaturesSection';
import { ScheduleSection } from '../components/ScheduleSection';
import { AnalyticsSection } from '../components/AnalyticsSection';
import { HowItWorksSection } from '../components/HowItWorksSection';
import { RealtimeSection } from '../components/RealtimeSection';
import { PricingSection } from '../components/PricingSection';
import { CtaSection } from '../components/CtaSection';
import { LandingFooter } from '../components/LandingFooter';
import { AuthModal } from '@/features/auth/components/AuthModal';
import { useScrollReveal } from '../hooks/useScrollReveal';
import '../landing.css';

export function LandingPage() {
  const ref = useScrollReveal();

  return (
    <div ref={ref} className="landing bg-grid">
      <Seo />
      <LandingHeader />
      <HeroSection />
      <FeaturesSection />
      <ScheduleSection />
      <AnalyticsSection />
      <HowItWorksSection />
      <RealtimeSection />
      <PricingSection />
      <CtaSection />
      <LandingFooter />
      <AuthModal />
    </div>
  );
}
