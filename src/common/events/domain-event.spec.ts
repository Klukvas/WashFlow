import { DomainEvent } from './domain-event';
import { EventType } from './event-types';

// ---------------------------------------------------------------------------
// Concrete test subclasses
// ---------------------------------------------------------------------------

class TestDomainEvent extends DomainEvent {
  readonly eventType = EventType.ORDER_CREATED;
  readonly tenantId = 'tenant-abc';
  readonly payload: Record<string, unknown> = { orderId: '123' };
}

class MinimalDomainEvent extends DomainEvent {
  readonly eventType = EventType.CLIENT_DELETED;
  readonly tenantId = 'tenant-xyz';
  readonly payload: Record<string, unknown> = {};
}

class RichPayloadDomainEvent extends DomainEvent {
  readonly eventType = EventType.PAYMENT_RECEIVED;
  readonly tenantId = 'tenant-rich';
  readonly payload: Record<string, unknown>;

  constructor(data: Record<string, unknown>) {
    super();
    this.payload = data;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DomainEvent', () => {
  describe('occurredAt', () => {
    it('is set to a Date instance automatically on construction', () => {
      const event = new TestDomainEvent();

      expect(event.occurredAt).toBeInstanceOf(Date);
    });

    it('is set before the assertion (not in the future)', () => {
      const before = new Date();
      const event = new TestDomainEvent();
      const after = new Date();

      expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(
        before.getTime(),
      );
      expect(event.occurredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('is a readonly property (does not change after construction)', () => {
      const event = new TestDomainEvent();
      const original = event.occurredAt;

      // TypeScript readonly prevents assignment at compile time, but we verify
      // the value remains stable across multiple reads at runtime.
      expect(event.occurredAt).toBe(original);
      expect(event.occurredAt).toBe(original);
    });

    it('two events created at different times have non-decreasing occurredAt values', async () => {
      const first = new TestDomainEvent();
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = new TestDomainEvent();

      expect(second.occurredAt.getTime()).toBeGreaterThanOrEqual(
        first.occurredAt.getTime(),
      );
    });
  });

  describe('eventType', () => {
    it('is accessible on a concrete subclass', () => {
      const event = new TestDomainEvent();

      expect(event.eventType).toBe(EventType.ORDER_CREATED);
    });

    it('reflects the specific value defined in each subclass', () => {
      const eventA = new TestDomainEvent();
      const eventB = new MinimalDomainEvent();

      expect(eventA.eventType).toBe(EventType.ORDER_CREATED);
      expect(eventB.eventType).toBe(EventType.CLIENT_DELETED);
    });

    it('is a non-empty string', () => {
      const event = new TestDomainEvent();

      expect(typeof event.eventType).toBe('string');
      expect(event.eventType.length).toBeGreaterThan(0);
    });
  });

  describe('tenantId', () => {
    it('is accessible on a concrete subclass', () => {
      const event = new TestDomainEvent();

      expect(event.tenantId).toBe('tenant-abc');
    });

    it('reflects the specific value defined in each subclass', () => {
      const eventA = new TestDomainEvent();
      const eventB = new MinimalDomainEvent();

      expect(eventA.tenantId).toBe('tenant-abc');
      expect(eventB.tenantId).toBe('tenant-xyz');
    });

    it('is a non-empty string', () => {
      const event = new TestDomainEvent();

      expect(typeof event.tenantId).toBe('string');
      expect(event.tenantId.length).toBeGreaterThan(0);
    });
  });

  describe('payload', () => {
    it('is accessible on a concrete subclass', () => {
      const event = new TestDomainEvent();

      expect(event.payload).toEqual({ orderId: '123' });
    });

    it('accepts an empty object as a valid payload', () => {
      const event = new MinimalDomainEvent();

      expect(event.payload).toEqual({});
    });

    it('preserves all keys and values passed to the payload', () => {
      const data: Record<string, unknown> = {
        id: 'pay-99',
        amount: 4200,
        currency: 'USD',
        nested: { fee: 10 },
        tags: ['urgent', 'vip'],
        nullField: null,
      };
      const event = new RichPayloadDomainEvent(data);

      expect(event.payload).toEqual(data);
    });

    it('is a plain object (Record<string, unknown>)', () => {
      const event = new TestDomainEvent();

      expect(typeof event.payload).toBe('object');
      expect(event.payload).not.toBeNull();
      expect(Array.isArray(event.payload)).toBe(false);
    });

    it('supports Unicode and special-character values', () => {
      const data: Record<string, unknown> = {
        note: 'Замовлення №1 – "срочно"! <b>ok</b>',
        emoji: 'Completed',
        sqlFragment: "'; DROP TABLE orders; --",
      };
      const event = new RichPayloadDomainEvent(data);

      expect(event.payload).toEqual(data);
    });
  });

  describe('abstract contract', () => {
    it('cannot be instantiated directly (only via concrete subclass)', () => {
      // TypeScript enforces this at compile time. At runtime we verify that
      // the concrete subclass satisfies the contract by checking all required
      // members are present.
      const event = new TestDomainEvent();

      expect(event).toHaveProperty('eventType');
      expect(event).toHaveProperty('tenantId');
      expect(event).toHaveProperty('payload');
      expect(event).toHaveProperty('occurredAt');
    });

    it('each concrete subclass instance is an instance of DomainEvent', () => {
      const eventA = new TestDomainEvent();
      const eventB = new MinimalDomainEvent();
      const eventC = new RichPayloadDomainEvent({});

      expect(eventA).toBeInstanceOf(DomainEvent);
      expect(eventB).toBeInstanceOf(DomainEvent);
      expect(eventC).toBeInstanceOf(DomainEvent);
    });
  });
});
