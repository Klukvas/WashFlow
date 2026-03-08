import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

export function PricingSection() {
  const { t } = useTranslation('landing');

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t('pricing.title')}
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          {t('pricing.subtitle')}
        </p>

        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="text-2xl">{t('pricing.trial')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Check className="h-4 w-4 text-primary" />
              <span>
                {t('pricing.trialDetails', {
                  users: 15,
                  branches: 3,
                  workPosts: 10,
                  services: 20,
                })}
              </span>
            </div>
            <Link to="/register">
              <Button size="lg" className="w-full sm:w-auto">
                {t('pricing.cta')}
              </Button>
            </Link>
            <p className="text-sm text-muted-foreground">
              {t('pricing.noCard')}
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
