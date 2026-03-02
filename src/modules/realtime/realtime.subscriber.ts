import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeGateway } from './realtime.gateway';
import { EventType } from '../../common/events/event-types';
import { DomainEvent } from '../../common/events/domain-event';

@Injectable()
export class RealtimeSubscriber {
  private readonly logger = new Logger(RealtimeSubscriber.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  @OnEvent(EventType.ORDER_CREATED)
  handleOrderCreated(event: DomainEvent) {
    try {
      this.gateway.emitToTenant(event.tenantId, 'order.created', event.payload);
      if (event.payload.branchId) {
        this.gateway.emitToBranch(
          event.payload.branchId as string,
          'order.created',
          event.payload,
        );
      }
    } catch (error) {
      this.logger.error('Failed to emit order.created', (error as Error).stack);
    }
  }

  @OnEvent(EventType.ORDER_STATUS_CHANGED)
  handleOrderStatusChanged(event: DomainEvent) {
    try {
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
    } catch (error) {
      this.logger.error(
        'Failed to emit order.status_changed',
        (error as Error).stack,
      );
    }
  }

  @OnEvent(EventType.ORDER_CANCELLED)
  handleOrderCancelled(event: DomainEvent) {
    try {
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
    } catch (error) {
      this.logger.error(
        'Failed to emit order.cancelled',
        (error as Error).stack,
      );
    }
  }
}
