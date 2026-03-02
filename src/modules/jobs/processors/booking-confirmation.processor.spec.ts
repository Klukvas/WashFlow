import { Test, TestingModule } from '@nestjs/testing';
import { BookingConfirmationProcessor } from './booking-confirmation.processor';
import { PrismaService } from '../../../prisma/prisma.service';
import { Job } from 'bullmq';

function makeJob(name: string, data: Record<string, unknown>): Job {
  return { name, data } as unknown as Job;
}

describe('BookingConfirmationProcessor', () => {
  let processor: BookingConfirmationProcessor;
  let prisma: {
    order: { findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingConfirmationProcessor,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    processor = module.get<BookingConfirmationProcessor>(
      BookingConfirmationProcessor,
    );
  });

  describe('process — confirmation-timeout', () => {
    const jobData = { orderId: 'order-1', tenantId: 'tenant-1' };

    it('should auto-cancel a pending order when timeout fires', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });

      await processor.process(makeJob('confirmation-timeout', jobData));

      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'order-1' },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Auto-cancelled: confirmation timeout',
        },
      });
    });

    it('should NOT cancel when order is no longer pending confirmation', async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await processor.process(makeJob('confirmation-timeout', jobData));

      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('should query the order with correct filters', async () => {
      await processor.process(makeJob('confirmation-timeout', jobData));

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          tenantId: 'tenant-1',
          status: 'BOOKED_PENDING_CONFIRMATION',
        },
      });
    });
  });

  describe('process — unknown job name', () => {
    it('should resolve without error for unrecognised job names', async () => {
      await expect(
        processor.process(makeJob('unknown-job', { tenantId: 'tenant-1' })),
      ).resolves.toBeUndefined();
    });

    it('should not query the database for unknown job names', async () => {
      await processor.process(makeJob('unknown-job', {}));
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });
  });
});
