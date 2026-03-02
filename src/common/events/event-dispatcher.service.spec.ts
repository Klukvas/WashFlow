import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EventDispatcherService } from './event-dispatcher.service';
import { DomainEvent } from './domain-event';
import { EventType } from './event-types';

// ---------------------------------------------------------------------------
// Concrete DomainEvent stubs for testing
// ---------------------------------------------------------------------------

class OrderCreatedEvent extends DomainEvent {
  readonly eventType = EventType.ORDER_CREATED;
  readonly tenantId: string;
  readonly payload: Record<string, unknown>;

  constructor(tenantId: string, payload: Record<string, unknown> = {}) {
    super();
    this.tenantId = tenantId;
    this.payload = payload;
  }
}

class PaymentReceivedEvent extends DomainEvent {
  readonly eventType = EventType.PAYMENT_RECEIVED;
  readonly tenantId: string;
  readonly payload: Record<string, unknown>;

  constructor(tenantId: string, payload: Record<string, unknown> = {}) {
    super();
    this.tenantId = tenantId;
    this.payload = payload;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const buildMockEmitter = () => ({ emit: jest.fn() });

async function buildModule(
  mockEmitter: ReturnType<typeof buildMockEmitter>,
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      EventDispatcherService,
      { provide: EventEmitter2, useValue: mockEmitter },
    ],
  }).compile();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventDispatcherService', () => {
  let service: EventDispatcherService;
  let mockEmitter: ReturnType<typeof buildMockEmitter>;

  beforeEach(async () => {
    mockEmitter = buildMockEmitter();
    const module = await buildModule(mockEmitter);
    service = module.get<EventDispatcherService>(EventDispatcherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Instantiation
  // -------------------------------------------------------------------------

  describe('instantiation', () => {
    it('can be resolved from the NestJS testing module', () => {
      expect(service).toBeDefined();
      expect(service).toBeInstanceOf(EventDispatcherService);
    });

    it('exposes the dispatch method', () => {
      expect(typeof service.dispatch).toBe('function');
    });
  });

  // -------------------------------------------------------------------------
  // dispatch – happy path
  // -------------------------------------------------------------------------

  describe('dispatch()', () => {
    it('calls eventEmitter.emit once per dispatch call', () => {
      const event = new OrderCreatedEvent('tenant-1', { orderId: 'ord-1' });

      service.dispatch(event);

      expect(mockEmitter.emit).toHaveBeenCalledTimes(1);
    });

    it('calls eventEmitter.emit with event.eventType as the first argument', () => {
      const event = new OrderCreatedEvent('tenant-1');

      service.dispatch(event);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        EventType.ORDER_CREATED,
        expect.anything(),
      );
    });

    it('calls eventEmitter.emit with the event instance as the second argument', () => {
      const event = new OrderCreatedEvent('tenant-1', { orderId: 'ord-42' });

      service.dispatch(event);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        expect.anything(),
        event,
      );
    });

    it('calls eventEmitter.emit with both correct eventType and event instance together', () => {
      const event = new OrderCreatedEvent('tenant-2', { orderId: 'ord-99' });

      service.dispatch(event);

      expect(mockEmitter.emit).toHaveBeenCalledWith(EventType.ORDER_CREATED, event);
    });

    it('passes the exact same event object reference (not a copy)', () => {
      const event = new OrderCreatedEvent('tenant-3');

      service.dispatch(event);

      const [, receivedEvent] = mockEmitter.emit.mock.calls[0] as [
        string,
        DomainEvent,
      ];
      expect(receivedEvent).toBe(event);
    });

    it('uses event.eventType as the emit channel (not a hardcoded string)', () => {
      const paymentEvent = new PaymentReceivedEvent('tenant-pay', {
        amount: 500,
      });

      service.dispatch(paymentEvent);

      expect(mockEmitter.emit).toHaveBeenCalledWith(
        EventType.PAYMENT_RECEIVED,
        paymentEvent,
      );
    });

    it('dispatches multiple different events independently', () => {
      const orderEvent = new OrderCreatedEvent('tenant-1', { orderId: 'a' });
      const paymentEvent = new PaymentReceivedEvent('tenant-2', {
        amount: 100,
      });

      service.dispatch(orderEvent);
      service.dispatch(paymentEvent);

      expect(mockEmitter.emit).toHaveBeenCalledTimes(2);
      expect(mockEmitter.emit).toHaveBeenNthCalledWith(
        1,
        EventType.ORDER_CREATED,
        orderEvent,
      );
      expect(mockEmitter.emit).toHaveBeenNthCalledWith(
        2,
        EventType.PAYMENT_RECEIVED,
        paymentEvent,
      );
    });

    it('dispatches the same event type multiple times without interference', () => {
      const eventA = new OrderCreatedEvent('tenant-1', { orderId: 'a' });
      const eventB = new OrderCreatedEvent('tenant-1', { orderId: 'b' });

      service.dispatch(eventA);
      service.dispatch(eventB);

      expect(mockEmitter.emit).toHaveBeenCalledTimes(2);
      expect(mockEmitter.emit).toHaveBeenNthCalledWith(
        1,
        EventType.ORDER_CREATED,
        eventA,
      );
      expect(mockEmitter.emit).toHaveBeenNthCalledWith(
        2,
        EventType.ORDER_CREATED,
        eventB,
      );
    });

    it('returns undefined (dispatch has no return value)', () => {
      const event = new OrderCreatedEvent('tenant-1');

      const result = service.dispatch(event);

      expect(result).toBeUndefined();
    });

    it('preserves payload data on the event passed to emit', () => {
      const payload = { orderId: 'ord-special', priority: 'high', count: 3 };
      const event = new OrderCreatedEvent('tenant-5', payload);

      service.dispatch(event);

      const [, dispatchedEvent] = mockEmitter.emit.mock.calls[0] as [
        string,
        DomainEvent,
      ];
      expect(dispatchedEvent.payload).toEqual(payload);
    });

    it('preserves tenantId on the event passed to emit', () => {
      const event = new OrderCreatedEvent('tenant-unique-99');

      service.dispatch(event);

      const [, dispatchedEvent] = mockEmitter.emit.mock.calls[0] as [
        string,
        DomainEvent,
      ];
      expect(dispatchedEvent.tenantId).toBe('tenant-unique-99');
    });

    it('preserves occurredAt on the event passed to emit', () => {
      const event = new OrderCreatedEvent('tenant-1');
      const originalDate = event.occurredAt;

      service.dispatch(event);

      const [, dispatchedEvent] = mockEmitter.emit.mock.calls[0] as [
        string,
        DomainEvent,
      ];
      expect(dispatchedEvent.occurredAt).toBe(originalDate);
    });
  });

  // -------------------------------------------------------------------------
  // Error propagation
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('propagates errors thrown by eventEmitter.emit', () => {
      const emitterError = new Error('Emitter failure');
      mockEmitter.emit.mockImplementation(() => {
        throw emitterError;
      });
      const event = new OrderCreatedEvent('tenant-err');

      expect(() => service.dispatch(event)).toThrow(emitterError);
    });

    it('does not suppress the original error type thrown by the emitter', () => {
      mockEmitter.emit.mockImplementation(() => {
        throw new TypeError('Wrong type');
      });
      const event = new OrderCreatedEvent('tenant-err');

      expect(() => service.dispatch(event)).toThrow(TypeError);
    });
  });
});
