export enum EventType {
  ORDER_CREATED = 'order.created',
  ORDER_UPDATED = 'order.updated',
  ORDER_STATUS_CHANGED = 'order.status_changed',
  ORDER_CANCELLED = 'order.cancelled',
  CLIENT_DELETED = 'client.deleted',
  PAYMENT_RECEIVED = 'payment.received',
  BOOKING_CONFIRMED = 'booking.confirmed',
  CLIENT_MERGED = 'client.merged',
}
