import { Helmet } from 'react-helmet-async';
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

const FAQ_SCHEMA = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What is WashFlow?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'WashFlow is a car wash management software that helps you manage scheduling, online booking, client database, analytics, workforce, and multiple locations — all from one platform.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is there a free trial?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, WashFlow offers a 30-day free trial with full access to all features. No credit card required.',
      },
    },
    {
      '@type': 'Question',
      name: 'Does WashFlow support multiple car wash locations?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, WashFlow supports multi-branch management. You can manage multiple locations from a single account with separate analytics, schedules, and staff for each branch.',
      },
    },
    {
      '@type': 'Question',
      name: 'Can my customers book online?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Yes, WashFlow provides a public booking page that your customers can use to book appointments 24/7 from any device. The system automatically checks availability to prevent double bookings.',
      },
    },
    {
      '@type': 'Question',
      name: 'What languages does WashFlow support?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'WashFlow currently supports English and Ukrainian. The entire interface, including the public booking page, is available in both languages.',
      },
    },
    {
      '@type': 'Question',
      name: 'Що таке WashFlow?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'WashFlow — це програма для управління автомийкою, яка допомагає керувати розкладом, онлайн-записом, базою клієнтів, аналітикою, персоналом та кількома локаціями — все в одній платформі.',
      },
    },
    {
      '@type': 'Question',
      name: 'Чи є безкоштовний пробний період?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Так, WashFlow пропонує 30-денний безкоштовний пробний період з повним доступом до всіх функцій. Кредитна картка не потрібна.',
      },
    },
  ],
});

export function LandingPage() {
  const ref = useScrollReveal();

  return (
    <div ref={ref} className="landing bg-grid">
      <Seo />
      <Helmet>
        <script type="application/ld+json">{FAQ_SCHEMA}</script>
      </Helmet>
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
