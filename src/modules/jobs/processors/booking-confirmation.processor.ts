import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

@Processor('booking-confirmations')
export class BookingConfirmationProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingConfirmationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'confirmation-timeout') {
      await this.handleConfirmationTimeout(job.data);
    }
  }

  private async handleConfirmationTimeout(data: {
    orderId: string;
    tenantId: string;
  }) {
    try {
      // Use updateMany with both id and tenantId for tenant isolation
      const result = await this.prisma.order.updateMany({
        where: {
          id: data.orderId,
          tenantId: data.tenantId,
          status: 'BOOKED_PENDING_CONFIRMATION',
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Auto-cancelled: confirmation timeout',
        },
      });

      if (result.count > 0) {
        this.logger.log(
          `Auto-cancelled order ${data.orderId} due to confirmation timeout`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to process confirmation timeout for order ${data.orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
