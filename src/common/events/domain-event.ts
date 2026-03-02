export abstract class DomainEvent {
  readonly occurredAt: Date = new Date();
  abstract readonly eventType: string;
  abstract readonly tenantId: string;
  abstract readonly payload: Record<string, unknown>;
}
