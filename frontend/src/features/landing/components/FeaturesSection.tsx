import { useTranslation } from 'react-i18next';
import {
  ShoppingCart,
  Users,
  Building2,
  BarChart3,
  HardHat,
  CalendarCheck,
  Clock,
  Shield,
  FileText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';

const features = [
  { key: 'orders', icon: ShoppingCart },
  { key: 'clients', icon: Users },
  { key: 'branches', icon: Building2 },
  { key: 'analytics', icon: BarChart3 },
  { key: 'team', icon: HardHat },
  { key: 'booking', icon: CalendarCheck },
  { key: 'scheduling', icon: Clock },
  { key: 'roles', icon: Shield },
  { key: 'audit', icon: FileText },
] as const;

export function FeaturesSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="features" className="bg-muted/50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('features.title')}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t('features.subtitle')}
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ key, icon: Icon }) => (
            <Card key={key}>
              <CardHeader>
                <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <CardTitle className="text-lg">
                  {t(`features.${key}.title`)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {t(`features.${key}.description`)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
