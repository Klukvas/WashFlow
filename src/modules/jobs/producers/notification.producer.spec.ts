import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationProducer } from './notification.producer';

describe('NotificationProducer', () => {
  let producer: NotificationProducer;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProducer,
        { provide: getQueueToken('notifications'), useValue: queue },
      ],
    }).compile();

    producer = module.get<NotificationProducer>(NotificationProducer);
  });

  describe('sendOrderConfirmation', () => {
    it('should add order-confirmation job to the queue', async () => {
      await producer.sendOrderConfirmation('order-1', 'tenant-1');
      expect(queue.add).toHaveBeenCalledWith(
        'order-confirmation',
        { orderId: 'order-1', tenantId: 'tenant-1' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  describe('sendStatusUpdate', () => {
    it('should add status-update job to the queue', async () => {
      await producer.sendStatusUpdate('order-2', 'tenant-1');
      expect(queue.add).toHaveBeenCalledWith(
        'status-update',
        { orderId: 'order-2', tenantId: 'tenant-1' },
        expect.objectContaining({ attempts: 3 }),
      );
    });
  });

  describe('sendBookingReminder', () => {
    it('should add booking-reminder job when delay is positive', async () => {
      // Schedule 2 hours from now — delay is positive
      const scheduledFor = new Date(Date.now() + 7_200_000);
      await producer.sendBookingReminder('order-3', 'tenant-1', scheduledFor);
      expect(queue.add).toHaveBeenCalledWith(
        'booking-reminder',
        { orderId: 'order-3', tenantId: 'tenant-1' },
        expect.objectContaining({ attempts: 2 }),
      );
    });

    it('should NOT add a job when scheduled time is less than 1 hour away', async () => {
      // Schedule 30 minutes from now — delay would be negative after subtracting 1h
      const scheduledFor = new Date(Date.now() + 1_800_000);
      await producer.sendBookingReminder('order-4', 'tenant-1', scheduledFor);
      expect(queue.add).not.toHaveBeenCalled();
    });
  });
});
