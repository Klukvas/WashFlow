import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeGateway } from './realtime.gateway';
import { EventType } from '../../common/events/event-types';
import { DomainEvent } from '../../common/events/domain-event';

@Injectable()
export class RealtimeSubscriber {
  constructor(private readonly gateway: RealtimeGateway) {}

  @OnEvent(EventType.ORDER_CREATED)
  handleOrderCreated(event: DomainEvent) {
    this.gateway.emitToTenant(event.tenantId, 'order.created', event.payload);
    if (event.payload.branchId) {
      this.gateway.emitToBranch(
        event.payload.branchId as string,
        'order.created',
        event.payload,
      );
    }
  }

  @OnEvent(EventType.ORDER_STATUS_CHANGED)
  handleOrderStatusChanged(event: DomainEvent) {
    this.gateway.emitToTenant(
      event.tenantId,
      'order.status_changed',
      event.payload,
    );
    if (event.payload.branchId) {
      this.gateway.emitToBranch(
        event.payload.branchId as string,
        'order.status_changed',
        event.payload,
      );
    }
  }

  @OnEvent(EventType.ORDER_CANCELLED)
  handleOrderCancelled(event: DomainEvent) {
    this.gateway.emitToTenant(
      event.tenantId,
      'order.cancelled',
      event.payload,
    );
    if (event.payload.branchId) {
      this.gateway.emitToBranch(
        event.payload.branchId as string,
        'order.cancelled',
        event.payload,
      );
    }
  }
}
