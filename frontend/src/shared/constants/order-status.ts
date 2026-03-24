import { OrderStatus } from '@/shared/types/enums';

export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.BOOKED_PENDING_CONFIRMATION]: [
    OrderStatus.BOOKED,
    OrderStatus.CANCELLED,
    OrderStatus.NO_SHOW,
  ],
  [OrderStatus.BOOKED]: [
    OrderStatus.IN_PROGRESS,
    OrderStatus.CANCELLED,
    OrderStatus.NO_SHOW,
  ],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.NO_SHOW]: [],
};

export const ORDER_STATUS_CONFIG: Record<
  OrderStatus,
  { label: string; color: string; bgColor: string }
> = {
  [OrderStatus.BOOKED_PENDING_CONFIRMATION]: {
    label: 'Pending Confirmation',
    color: 'text-warning',
    bgColor: 'bg-warning/10',
  },
  [OrderStatus.BOOKED]: {
    label: 'Booked',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  [OrderStatus.IN_PROGRESS]: {
    label: 'In Progress',
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  [OrderStatus.COMPLETED]: {
    label: 'Completed',
    color: 'text-success',
    bgColor: 'bg-success/10',
  },
  [OrderStatus.CANCELLED]: {
    label: 'Cancelled',
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
  [OrderStatus.NO_SHOW]: {
    label: 'No Show',
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
  },
};
