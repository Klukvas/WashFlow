import { OrderStatus } from '@prisma/client';

export const VALID_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  BOOKED_PENDING_CONFIRMATION: ['BOOKED', 'CANCELLED', 'NO_SHOW'],
  BOOKED: ['IN_PROGRESS', 'CANCELLED', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};
