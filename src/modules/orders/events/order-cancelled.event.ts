import { DomainEvent } from '../../../common/events/domain-event';
import { EventType } from '../../../common/events/event-types';

export class OrderCancelledEvent extends DomainEvent {
  readonly eventType = EventType.ORDER_CANCELLED;

  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}
