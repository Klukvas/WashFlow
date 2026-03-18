import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useServices } from '@/features/services/hooks/useServices';
import { Button } from '@/shared/ui/button';
import { CardHeader, CardTitle } from '@/shared/ui/card';
import { formatCurrency, formatDuration } from '@/shared/utils/format';
import { cn } from '@/shared/utils/cn';

interface StepServicesProps {
  serviceIds: string[];
  onToggleService: (serviceId: string) => void;
  onNext: () => void;
  onBack: () => void;
}

export function StepServices({
  serviceIds,
  onToggleService,
  onNext,
  onBack,
}: StepServicesProps) {
  const { t } = useTranslation('orders');
  const { t: tc } = useTranslation('common');

  const { data: servicesData } = useServices({ limit: 100 });
  const services = (servicesData?.items ?? []).filter((s) => s.isActive);

  const totalDuration = services
    .filter((s) => serviceIds.includes(s.id))
    .reduce((sum, s) => sum + s.durationMin, 0);

  const totalPrice = services
    .filter((s) => serviceIds.includes(s.id))
    .reduce((sum, s) => sum + Number(s.price), 0);

  return (
    <div className="space-y-4">
      <CardHeader className="p-0">
        <CardTitle className="text-lg">
          {t('creation.selectServices')}
        </CardTitle>
      </CardHeader>
      <div className="space-y-2">
        {services.map((s) => (
          <button
            key={s.id}
            aria-pressed={serviceIds.includes(s.id)}
            className={cn(
              'flex w-full items-center justify-between rounded-md border px-4 py-3 text-left hover:bg-accent',
              serviceIds.includes(s.id) && 'border-primary bg-primary/10',
            )}
            onClick={() => onToggleService(s.id)}
          >
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-sm text-muted-foreground">
                {formatDuration(s.durationMin)}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold">
                {formatCurrency(Number(s.price))}
              </span>
              {serviceIds.includes(s.id) && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
          </button>
        ))}
      </div>
      {serviceIds.length > 0 && (
        <div className="flex items-center justify-between rounded-md bg-muted p-4">
          <div>
            <p className="text-sm text-muted-foreground">
              {t('creation.totalDuration')}
            </p>
            <p className="font-semibold">{formatDuration(totalDuration)}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">
              {t('creation.totalAmount')}
            </p>
            <p className="text-lg font-bold">{formatCurrency(totalPrice)}</p>
          </div>
        </div>
      )}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          {tc('actions.back')}
        </Button>
        <Button onClick={onNext} disabled={serviceIds.length === 0}>
          {tc('actions.next')}
        </Button>
      </div>
    </div>
  );
}
