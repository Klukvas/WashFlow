import { DomainEvent } from './domain-event';
import { EventType } from './event-types';

export class SubscriptionActivatedEvent extends DomainEvent {
  readonly eventType = EventType.SUBSCRIPTION_ACTIVATED;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      planTier: string;
      billingInterval: string;
      paddleSubscriptionId: string;
    },
  ) {
    super();
  }
}

export class SubscriptionChangedEvent extends DomainEvent {
  readonly eventType = EventType.SUBSCRIPTION_CHANGED;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      previousPlanTier: string;
      newPlanTier: string;
      changeType: 'upgrade' | 'downgrade' | 'addon_change';
    },
  ) {
    super();
  }
}

export class SubscriptionCancelledEvent extends DomainEvent {
  readonly eventType = EventType.SUBSCRIPTION_CANCELLED;

  constructor(
    readonly tenantId: string,
    readonly payload: {
      effectiveAt: string;
      paddleSubscriptionId: string;
    },
  ) {
    super();
  }
}
