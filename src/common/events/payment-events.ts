import { DomainEvent } from './domain-event';
import { EventType } from './event-types';

export class PaymentReceivedEvent extends DomainEvent {
  readonly eventType = EventType.PAYMENT_RECEIVED;

  constructor(
    readonly tenantId: string,
    readonly payload: Record<string, unknown>,
  ) {
    super();
  }
}
