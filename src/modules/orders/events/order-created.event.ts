import { DomainEvent } from '../../../common/events/domain-event';
import { EventType } from '../../../common/events/event-types';

export class OrderCreatedEvent extends DomainEvent {
  readonly eventType = EventType.ORDER_CREATED;

  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}
