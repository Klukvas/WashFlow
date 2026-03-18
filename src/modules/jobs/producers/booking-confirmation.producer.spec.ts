import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BookingConfirmationProducer } from './booking-confirmation.producer';

describe('BookingConfirmationProducer', () => {
  let producer: BookingConfirmationProducer;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConfirmationProducer,
        {
          provide: getQueueToken('booking-confirmations'),
          useValue: queue,
        },
      ],
    }).compile();

    producer = module.get<BookingConfirmationProducer>(
      BookingConfirmationProducer,
    );
  });

  describe('scheduleConfirmationTimeout', () => {
    it('should add confirmation-timeout job with correct delay', async () => {
      await producer.scheduleConfirmationTimeout('order-1', 'tenant-1', 30);
      expect(queue.add).toHaveBeenCalledWith(
        'confirmation-timeout',
        { orderId: 'order-1', tenantId: 'tenant-1' },
        expect.objectContaining({ delay: 30 * 60000, attempts: 3 }),
      );
    });

    it('should calculate delay as timeoutMinutes * 60000 ms', async () => {
      await producer.scheduleConfirmationTimeout('order-2', 'tenant-1', 15);
      const callArgs = queue.add.mock.calls[0];
      expect(callArgs[2].delay).toBe(15 * 60000);
    });
  });
});
