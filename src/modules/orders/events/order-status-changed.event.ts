import { DomainEvent } from '../../../common/events/domain-event';
import { EventType } from '../../../common/events/event-types';

export class OrderStatusChangedEvent extends DomainEvent {
  readonly eventType = EventType.ORDER_STATUS_CHANGED;

  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}
