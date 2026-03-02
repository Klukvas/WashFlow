import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/utils/cn';
import { ORDER_STATUS_CONFIG } from '@/shared/constants/order-status';
import type { OrderStatus } from '@/shared/types/enums';

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation('orders');
  const config = ORDER_STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.bgColor,
        config.color,
        className,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
