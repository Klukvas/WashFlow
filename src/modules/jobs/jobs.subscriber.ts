import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationProducer } from './producers/notification.producer';
import { AnalyticsProducer } from './producers/analytics.producer';
import { BookingConfirmationProducer } from './producers/booking-confirmation.producer';
import { EventType } from '../../common/events/event-types';
import { DomainEvent } from '../../common/events/domain-event';

@Injectable()
export class JobsSubscriber {
  constructor(
    private readonly notificationProducer: NotificationProducer,
    private readonly analyticsProducer: AnalyticsProducer,
    private readonly bookingProducer: BookingConfirmationProducer,
  ) {}

  @OnEvent(EventType.ORDER_CREATED)
  async onOrderCreated(event: DomainEvent) {
    await this.notificationProducer.sendOrderConfirmation(
      event.payload.id as string,
      event.tenantId,
    );

    await this.analyticsProducer.recordOrderCreated(
      event.tenantId,
      event.payload,
    );

    // For web bookings, schedule confirmation timeout
    if (event.payload.source === 'WEB') {
      await this.bookingProducer.scheduleConfirmationTimeout(
        event.payload.id as string,
        event.tenantId,
        30, // 30 minutes to confirm
      );
    }
  }

  @OnEvent(EventType.ORDER_STATUS_CHANGED)
  async onOrderStatusChanged(event: DomainEvent) {
    await this.notificationProducer.sendStatusUpdate(
      event.payload.orderId as string,
      event.tenantId,
    );
  }
}
