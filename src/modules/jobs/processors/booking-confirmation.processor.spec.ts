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
    order: { updateMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      order: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
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
      prisma.order.updateMany.mockResolvedValue({ count: 1 });

      await processor.process(makeJob('confirmation-timeout', jobData));

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          tenantId: 'tenant-1',
          status: 'BOOKED_PENDING_CONFIRMATION',
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Auto-cancelled: confirmation timeout',
        },
      });
    });

    it('should call updateMany even when no matching orders (returns count 0)', async () => {
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await processor.process(makeJob('confirmation-timeout', jobData));

      expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    });

    it('should use both orderId and tenantId in the where clause for tenant isolation', async () => {
      await processor.process(makeJob('confirmation-timeout', jobData));

      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'order-1',
            tenantId: 'tenant-1',
            status: 'BOOKED_PENDING_CONFIRMATION',
          }),
        }),
      );
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
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });
  });
});
