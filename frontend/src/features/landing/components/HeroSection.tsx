import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/shared/ui/button';

export function HeroSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="py-20 text-center lg:py-32">
      <div className="mx-auto max-w-3xl px-4">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          {t('hero.subtitle')}
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link to="/register">
            <Button size="lg" className="gap-2">
              {t('hero.cta')}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <a href="#features">
            <Button variant="outline" size="lg">
              {t('hero.secondaryCta')}
            </Button>
          </a>
        </div>
      </div>
    </section>
  );
}
