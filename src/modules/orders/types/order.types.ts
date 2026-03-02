import { OrderStatus } from '@prisma/client';

export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  BOOKED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  BOOKED_PENDING_CONFIRMATION: ['BOOKED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
