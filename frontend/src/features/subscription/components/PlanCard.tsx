import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Badge } from '@/shared/ui/badge';
import { cn } from '@/shared/utils/cn';
import type {
  PlanDefinition,
  BillingInterval,
  PlanTier,
} from '../api/subscription.api';

interface PlanCardProps {
  plan: PlanDefinition;
  billingInterval: BillingInterval;
  currentTier?: PlanTier;
  isCancelled?: boolean;
  onSelect: (tier: PlanTier) => void;
  isLoading?: boolean;
  paymentsEnabled?: boolean;
}

export function PlanCard({
  plan,
  billingInterval,
  currentTier,
  isCancelled,
  onSelect,
  isLoading,
  paymentsEnabled = true,
}: PlanCardProps) {
  const { t } = useTranslation('subscription');
  const isCurrent = currentTier === plan.tier;
  const price =
    billingInterval === 'YEARLY' ? plan.yearlyPrice : plan.monthlyPrice;
  const monthlyEquivalent =
    billingInterval === 'YEARLY'
      ? Math.round(plan.yearlyPrice / 12)
      : plan.monthlyPrice;
  const isPopular = plan.tier === 'BUSINESS';

  const limitLabel = (value: number | null) =>
    value === null ? t('plans.unlimited') : String(value);

  return (
    <Card
      className={cn(
        'relative flex flex-col',
        isPopular && 'border-primary shadow-md',
        isCurrent && 'border-green-500/50 bg-green-500/5',
      )}
    >
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          {t('plans.popular')}
        </Badge>
      )}
      <CardHeader className="text-center">
        <CardTitle className="text-lg">{plan.name}</CardTitle>
        <div className="mt-2">
          <span className="text-3xl font-bold">${monthlyEquivalent}</span>
          <span className="text-sm text-muted-foreground">
            /{t('plans.month')}
          </span>
        </div>
        {billingInterval === 'YEARLY' && (
          <p className="text-xs text-muted-foreground">
            ${price}/{t('plans.year')} ({t('plans.twoMonthsFree')})
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="flex-1 space-y-2 text-sm">
          <LimitRow
            label={t('resources.branches')}
            value={limitLabel(plan.limits.branches)}
          />
          <LimitRow
            label={t('resources.workPosts')}
            value={limitLabel(plan.limits.workPosts)}
          />
          <LimitRow
            label={t('resources.users')}
            value={limitLabel(plan.limits.users)}
          />
          <LimitRow
            label={t('resources.services')}
            value={limitLabel(plan.limits.services)}
          />
          {plan.addonsAvailable && (
            <LimitRow label={t('plans.addons')} value={t('plans.available')} />
          )}
        </ul>
        {paymentsEnabled && (
          <Button
            className="w-full"
            variant={
              isCurrent && !isCancelled
                ? 'outline'
                : isPopular
                  ? 'default'
                  : 'outline'
            }
            disabled={(isCurrent && !isCancelled) || isLoading}
            onClick={() => onSelect(plan.tier)}
          >
            {isCurrent && !isCancelled
              ? t('plans.currentPlan')
              : isCurrent && isCancelled
                ? t('cancel.reactivate')
                : t('plans.selectPlan')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-4 w-4 text-green-500" />
      <span>
        {value} {label}
      </span>
    </li>
  );
}
