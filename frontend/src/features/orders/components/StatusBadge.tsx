import { useTranslation } from 'react-i18next';
import { OrderStatus } from '@/shared/types/enums';
import { ORDER_STATUS_CONFIG } from '@/shared/constants/order-status';
import { cn } from '@/shared/utils/cn';

interface StatusBadgeProps {
  status: OrderStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const { t } = useTranslation('orders');
  const config = ORDER_STATUS_CONFIG[status];

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        config.bgColor,
        config.color,
      )}
    >
      {t(`status.${status}`)}
    </span>
  );
}
