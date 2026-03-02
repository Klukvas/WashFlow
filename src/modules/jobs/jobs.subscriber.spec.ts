import { Test, TestingModule } from '@nestjs/testing';
import { JobsSubscriber } from './jobs.subscriber';
import { NotificationProducer } from './producers/notification.producer';
import { AnalyticsProducer } from './producers/analytics.producer';
import { BookingConfirmationProducer } from './producers/booking-confirmation.producer';
import { DomainEvent } from '../../common/events/domain-event';

describe('JobsSubscriber', () => {
  let subscriber: JobsSubscriber;
  let notificationProducer: { sendOrderConfirmation: jest.Mock; sendStatusUpdate: jest.Mock };
  let analyticsProducer: { recordOrderCreated: jest.Mock };
  let bookingProducer: { scheduleConfirmationTimeout: jest.Mock };

  const tenantId = 'tenant-1';

  function makeEvent(payload: Record<string, unknown>): DomainEvent {
    return { tenantId, payload } as DomainEvent;
  }

  beforeEach(async () => {
    notificationProducer = {
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };
    analyticsProducer = {
      recordOrderCreated: jest.fn().mockResolvedValue(undefined),
    };
    bookingProducer = {
      scheduleConfirmationTimeout: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsSubscriber,
        { provide: NotificationProducer, useValue: notificationProducer },
        { provide: AnalyticsProducer, useValue: analyticsProducer },
        { provide: BookingConfirmationProducer, useValue: bookingProducer },
      ],
    }).compile();

    subscriber = module.get<JobsSubscriber>(JobsSubscriber);
  });

  describe('onOrderCreated', () => {
    it('should send order confirmation notification', async () => {
      const event = makeEvent({ id: 'order-1', source: 'INTERNAL' });
      await subscriber.onOrderCreated(event);
      expect(notificationProducer.sendOrderConfirmation).toHaveBeenCalledWith(
        'order-1',
        tenantId,
      );
    });

    it('should record order in analytics', async () => {
      const event = makeEvent({ id: 'order-1', source: 'INTERNAL' });
      await subscriber.onOrderCreated(event);
      expect(analyticsProducer.recordOrderCreated).toHaveBeenCalledWith(
        tenantId,
        event.payload,
      );
    });

    it('should schedule booking confirmation timeout for WEB source orders', async () => {
      const event = makeEvent({ id: 'order-web', source: 'WEB' });
      await subscriber.onOrderCreated(event);
      expect(bookingProducer.scheduleConfirmationTimeout).toHaveBeenCalledWith(
        'order-web',
        tenantId,
        30,
      );
    });

    it('should NOT schedule confirmation timeout for non-WEB orders', async () => {
      for (const source of ['INTERNAL', 'WIDGET', 'API']) {
        bookingProducer.scheduleConfirmationTimeout.mockClear();
        const event = makeEvent({ id: 'order-1', source });
        await subscriber.onOrderCreated(event);
        expect(bookingProducer.scheduleConfirmationTimeout).not.toHaveBeenCalled();
      }
    });
  });

  describe('onOrderStatusChanged', () => {
    it('should send a status update notification', async () => {
      const event = makeEvent({
        orderId: 'order-2',
        previousStatus: 'BOOKED',
        newStatus: 'IN_PROGRESS',
      });
      await subscriber.onOrderStatusChanged(event);
      expect(notificationProducer.sendStatusUpdate).toHaveBeenCalledWith(
        'order-2',
        tenantId,
      );
    });

    it('should not dispatch analytics or booking jobs on status change', async () => {
      const event = makeEvent({ orderId: 'order-2', newStatus: 'COMPLETED' });
      await subscriber.onOrderStatusChanged(event);
      expect(analyticsProducer.recordOrderCreated).not.toHaveBeenCalled();
      expect(bookingProducer.scheduleConfirmationTimeout).not.toHaveBeenCalled();
    });
  });
});
