import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router';
import { Droplets, Clock, ArrowRight } from 'lucide-react';
import { usePublicServices, usePublicBranches } from '../hooks/usePublicBooking';
import { Card, CardContent } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { formatCurrency, formatDuration } from '@/shared/utils/format';

export function PublicLandingPage() {
  const { t } = useTranslation('public-booking');
  const { slug } = useParams<{ slug: string }>();

  const { data: branches, isLoading: branchesLoading } = usePublicBranches(
    slug!,
  );
  const { data: services, isLoading: servicesLoading } = usePublicServices(
    slug!,
  );

  if (branchesLoading || servicesLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="mx-auto h-12 w-64" />
        <Skeleton className="mx-auto h-6 w-96" />
        <Skeleton className="h-12 w-48 mx-auto" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  const branchName = branches?.[0]?.name ?? 'WashFlow';

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="py-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <Droplets className="h-10 w-10 text-primary" />
        </div>
        <h1 className="mb-3 text-3xl font-bold sm:text-4xl">{branchName}</h1>
        <p className="mx-auto mb-8 max-w-md text-lg text-muted-foreground">
          {t('landingSubtitle')}
        </p>
        <Link to="book">
          <Button size="lg" className="gap-2 px-8 text-base">
            {t('bookNow')}
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </section>

      {/* Services */}
      {services && services.length > 0 && (
        <section>
          <h2 className="mb-6 text-center text-2xl font-bold">
            {t('ourServices')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {services.map((service) => (
              <Card key={service.id}>
                <CardContent className="p-5">
                  <div className="mb-2 flex items-start justify-between">
                    <h3 className="font-semibold">{service.name}</h3>
                    <span className="whitespace-nowrap text-lg font-bold text-primary">
                      {formatCurrency(Number(service.price))}
                    </span>
                  </div>
                  {service.description && (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {service.description}
                    </p>
                  )}
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {formatDuration(service.durationMin)}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Bottom CTA */}
      <section className="text-center">
        <Link to="book">
          <Button size="lg" className="gap-2 px-8 text-base">
            {t('bookNow')}
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
      </section>
    </div>
  );
}
