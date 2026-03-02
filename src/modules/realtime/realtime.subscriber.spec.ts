import { Test, TestingModule } from '@nestjs/testing';
import { RealtimeSubscriber } from './realtime.subscriber';
import { RealtimeGateway } from './realtime.gateway';
import { DomainEvent } from '../../common/events/domain-event';

describe('RealtimeSubscriber', () => {
  let subscriber: RealtimeSubscriber;
  let gateway: { emitToTenant: jest.Mock; emitToBranch: jest.Mock };

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';

  function makeEvent(
    payload: Record<string, unknown>,
  ): DomainEvent {
    return { tenantId, payload } as DomainEvent;
  }

  beforeEach(async () => {
    gateway = {
      emitToTenant: jest.fn(),
      emitToBranch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeSubscriber,
        { provide: RealtimeGateway, useValue: gateway },
      ],
    }).compile();

    subscriber = module.get<RealtimeSubscriber>(RealtimeSubscriber);
  });

  describe('handleOrderCreated', () => {
    it('should emit order.created to the tenant room', () => {
      const event = makeEvent({ id: 'order-1' });
      subscriber.handleOrderCreated(event);
      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        tenantId,
        'order.created',
        event.payload,
      );
    });

    it('should emit order.created to the branch room when branchId is present', () => {
      const event = makeEvent({ id: 'order-1', branchId });
      subscriber.handleOrderCreated(event);
      expect(gateway.emitToBranch).toHaveBeenCalledWith(
        branchId,
        'order.created',
        event.payload,
      );
    });

    it('should NOT emit to branch when branchId is absent', () => {
      const event = makeEvent({ id: 'order-1' });
      subscriber.handleOrderCreated(event);
      expect(gateway.emitToBranch).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderStatusChanged', () => {
    it('should emit order.status_changed to the tenant room', () => {
      const event = makeEvent({ orderId: 'order-2', newStatus: 'IN_PROGRESS' });
      subscriber.handleOrderStatusChanged(event);
      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        tenantId,
        'order.status_changed',
        event.payload,
      );
    });

    it('should emit order.status_changed to the branch room when branchId is present', () => {
      const event = makeEvent({ orderId: 'order-2', branchId });
      subscriber.handleOrderStatusChanged(event);
      expect(gateway.emitToBranch).toHaveBeenCalledWith(
        branchId,
        'order.status_changed',
        event.payload,
      );
    });

    it('should NOT emit to branch when branchId is absent', () => {
      const event = makeEvent({ orderId: 'order-2' });
      subscriber.handleOrderStatusChanged(event);
      expect(gateway.emitToBranch).not.toHaveBeenCalled();
    });
  });

  describe('handleOrderCancelled', () => {
    it('should emit order.cancelled to the tenant room', () => {
      const event = makeEvent({ orderId: 'order-3', reason: 'No show' });
      subscriber.handleOrderCancelled(event);
      expect(gateway.emitToTenant).toHaveBeenCalledWith(
        tenantId,
        'order.cancelled',
        event.payload,
      );
    });

    it('should emit order.cancelled to the branch room when branchId is present', () => {
      const event = makeEvent({ orderId: 'order-3', branchId });
      subscriber.handleOrderCancelled(event);
      expect(gateway.emitToBranch).toHaveBeenCalledWith(
        branchId,
        'order.cancelled',
        event.payload,
      );
    });

    it('should NOT emit to branch when branchId is absent', () => {
      const event = makeEvent({ orderId: 'order-3' });
      subscriber.handleOrderCancelled(event);
      expect(gateway.emitToBranch).not.toHaveBeenCalled();
    });
  });
});
