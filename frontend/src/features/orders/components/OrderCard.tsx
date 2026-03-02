import { useTranslation } from 'react-i18next';
import { Calendar, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/shared/ui/card';
import { StatusBadge } from './StatusBadge';
import { SoftDeleteBadge } from '@/shared/components/SoftDeleteBadge';
import { formatDateTime, formatCurrency } from '@/shared/utils/format';
import type { Order } from '@/shared/types/models';

interface OrderCardProps {
  order: Order;
  onClick: () => void;
}

export function OrderCard({ order, onClick }: OrderCardProps) {
  const { t } = useTranslation('orders');

  return (
    <Card className="cursor-pointer transition-shadow hover:shadow-md" onClick={onClick}>
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="font-medium">
              {order.client
                ? `${order.client.firstName} ${order.client.lastName}`
                : t('fields.client')}
            </p>
            <p className="text-sm text-muted-foreground">
              {order.vehicle?.licensePlate ?? ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={order.status} />
            <SoftDeleteBadge deletedAt={order.deletedAt} />
          </div>
        </div>

        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>{formatDateTime(order.scheduledStart)}</span>
          </div>
          {order.branch && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>{order.branch.name}</span>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">
            {order.services?.length ?? 0} {t('fields.services').toLowerCase()}
          </span>
          <span className="font-semibold">{formatCurrency(order.totalPrice)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
