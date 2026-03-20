import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  Users,
  Building2,
  Columns3,
  Wrench,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { ROUTES } from '@/shared/constants/routes';

export type ResourceKey = 'branches' | 'workPosts' | 'users' | 'services';

export interface Violation {
  resource: ResourceKey;
  current: number;
  limit: number;
  managePath: string;
}

export interface LostAddon {
  resource: string;
  name: string;
  quantity: number;
}

interface DowngradeBlockedDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  planName: string;
  violations: Violation[];
  lostAddons: LostAddon[];
  isLoading?: boolean;
}

const RESOURCE_ICON: Record<ResourceKey, LucideIcon> = {
  users: Users,
  branches: Building2,
  workPosts: Columns3,
  services: Wrench,
};

const RESOURCE_ROUTE: Record<ResourceKey, string> = {
  users: ROUTES.USERS,
  branches: ROUTES.BRANCHES,
  workPosts: ROUTES.WORK_POSTS,
  services: ROUTES.SERVICES,
};

export function buildViolations(
  usage: Record<ResourceKey, { current: number; max: number | null }>,
  targetLimits: Record<ResourceKey, number | null>,
): Violation[] {
  const resources: ResourceKey[] = [
    'branches',
    'workPosts',
    'users',
    'services',
  ];

  return resources.reduce<Violation[]>((acc, resource) => {
    const limit = targetLimits[resource];
    const current = usage[resource].current;

    if (limit !== null && current > limit) {
      return [
        ...acc,
        { resource, current, limit, managePath: RESOURCE_ROUTE[resource] },
      ];
    }
    return acc;
  }, []);
}

export function DowngradeBlockedDialog({
  open,
  onClose,
  onConfirm,
  planName,
  violations,
  lostAddons,
  isLoading,
}: DowngradeBlockedDialogProps) {
  const { t } = useTranslation('subscription');
  const navigate = useNavigate();

  const hasViolations = violations.length > 0;
  const hasLostAddons = lostAddons.length > 0;

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>
          {hasViolations
            ? t('downgrade.blockedTitle', { plan: planName })
            : t('downgrade.warningTitle', { plan: planName })}
        </DialogTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasViolations
            ? t('downgrade.blockedDescription', { plan: planName })
            : t('downgrade.warningDescription', { plan: planName })}
        </p>
      </DialogHeader>

      <DialogContent className="space-y-4">
        {/* Limit violations */}
        {hasViolations && (
          <ul className="space-y-3">
            {violations.map((v) => {
              const Icon = RESOURCE_ICON[v.resource];
              return (
                <li
                  key={v.resource}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">
                        {t(`resources.${v.resource}`)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t('downgrade.excess', {
                          current: v.current,
                          limit: v.limit,
                          count: v.current - v.limit,
                        })}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      navigate(v.managePath);
                    }}
                  >
                    {t('downgrade.manage')}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Lost add-ons warning */}
        {hasLostAddons && (
          <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/5 p-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                {t('downgrade.addonsLostTitle')}
              </p>
            </div>
            <ul className="space-y-1">
              {lostAddons.map((addon) => (
                <li
                  key={addon.resource}
                  className="text-xs text-muted-foreground"
                >
                  {addon.name} ×{addon.quantity}
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>

      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {t('downgrade.close')}
        </Button>
        {!hasViolations && onConfirm && (
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading}
          >
            {t('downgrade.confirmSwitch')}
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
