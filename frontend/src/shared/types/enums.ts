export const OrderStatus = {
  BOOKED: 'BOOKED',
  BOOKED_PENDING_CONFIRMATION: 'BOOKED_PENDING_CONFIRMATION',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const OrderSource = {
  INTERNAL: 'INTERNAL',
  WEB: 'WEB',
  WIDGET: 'WIDGET',
  API: 'API',
} as const;
export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  ONLINE: 'ONLINE',
  OTHER: 'OTHER',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  STATUS_CHANGE: 'STATUS_CHANGE',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
