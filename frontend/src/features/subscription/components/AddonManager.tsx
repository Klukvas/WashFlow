import { useTranslation } from 'react-i18next';
import { Plus, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import type { AddonDefinition, SubscriptionAddon } from '../api/subscription.api';

interface AddonManagerProps {
  addons: AddonDefinition[];
  currentAddons: SubscriptionAddon[];
  onUpdate: (resource: string, quantity: number) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function AddonManager({
  addons,
  currentAddons,
  onUpdate,
  isLoading,
  disabled,
}: AddonManagerProps) {
  const { t } = useTranslation('subscription');

  const getQuantity = (resource: string): number => {
    const existing = currentAddons.find((a) => a.resource === resource);
    return existing?.quantity ?? 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('addons.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('addons.description')}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {addons.map((addon) => {
          const qty = getQuantity(addon.resource);
          return (
            <div
              key={addon.resource}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div>
                <p className="text-sm font-medium">{addon.name}</p>
                <p className="text-xs text-muted-foreground">
                  +{addon.unitSize} {t('addons.perUnit')} &middot; $
                  {addon.monthlyPrice}/{t('plans.month')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={qty <= 0 || isLoading || disabled}
                  onClick={() => onUpdate(addon.resource, qty - 1)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-sm font-medium">
                  {qty}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={isLoading || disabled}
                  onClick={() => onUpdate(addon.resource, qty + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
