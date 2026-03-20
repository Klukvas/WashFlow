import { useTranslation } from 'react-i18next';
import {
  CalendarCheck,
  ShoppingCart,
  Users,
  Car,
  HardHat,
  Shield,
} from 'lucide-react';
import type { ElementType } from 'react';
import { cn } from '@/shared/utils/cn';

const screenshots: Array<{
  key: string;
  src: string;
  icon: ElementType;
}> = [
  { key: 'orders', src: '/screenshots/orders.png', icon: CalendarCheck },
  { key: 'createOrder', src: '/screenshots/create-order.png', icon: ShoppingCart },
  { key: 'clients', src: '/screenshots/clients.png', icon: Users },
  { key: 'vehicles', src: '/screenshots/vehicles.png', icon: Car },
  { key: 'users', src: '/screenshots/users.png', icon: HardHat },
  { key: 'roles', src: '/screenshots/roles-permissions.png', icon: Shield },
];

export function ScreenshotsSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="screenshots" className="py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {t('screenshots.title')}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            {t('screenshots.subtitle')}
          </p>
        </div>

        <div className="mt-16 space-y-24">
          {screenshots.map(({ key, src, icon: Icon }, i) => {
            const flipped = i % 2 === 1;
            return (
              <div
                key={key}
                className={cn(
                  'flex flex-col items-center gap-8 lg:flex-row lg:gap-12',
                  flipped && 'lg:flex-row-reverse',
                )}
              >
                {/* Screenshot */}
                <div className="w-full lg:w-3/5">
                  <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xl ring-1 ring-black/5">
                    <img
                      src={src}
                      alt={t(`screenshots.tabs.${key}`)}
                      className="w-full"
                      loading="lazy"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="w-full lg:w-2/5">
                  <div
                    className={cn(
                      'flex h-12 w-12 items-center justify-center rounded-xl',
                      'bg-primary/10',
                    )}
                  >
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-4 text-2xl font-bold">
                    {t(`screenshots.tabs.${key}`)}
                  </h3>
                  <p className="mt-3 text-muted-foreground leading-relaxed">
                    {t(`screenshots.captions.${key}`)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
