import { usePayments } from '../hooks/usePayments';
import { formatCurrency, formatDateTime } from '@/shared/utils/format';
import { Badge } from '@/shared/ui/badge';
import { Skeleton } from '@/shared/ui/skeleton';

interface PaymentsListProps {
  orderId: string;
}

export function PaymentsList({ orderId }: PaymentsListProps) {
  const { data: payments, isLoading } = usePayments(orderId);

  if (isLoading) return <Skeleton className="h-24" />;

  if (!payments || payments.length === 0) {
    return <p className="text-sm text-muted-foreground">No payments recorded</p>;
  }

  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between rounded-md bg-muted/50 px-4 py-3">
          <div>
            <p className="font-medium">{formatCurrency(p.amount)}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{p.method}</Badge>
            <Badge variant={p.status === 'PAID' ? 'success' : 'outline'}>{p.status}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}
