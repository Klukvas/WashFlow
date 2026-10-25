import { DomainEvent } from './domain-event';
import { EventType } from './event-types';

export class OrderRescheduledEvent extends DomainEvent {
  readonly eventType = EventType.ORDER_RESCHEDULED;
  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}
