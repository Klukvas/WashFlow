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
    const order = await this.prisma.order.findFirst({
      where: {
        id: data.orderId,
        tenantId: data.tenantId,
        status: 'BOOKED_PENDING_CONFIRMATION',
      },
    });

    if (order) {
      // Auto-cancel if still pending after timeout
      await this.prisma.order.update({
        where: { id: data.orderId },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'Auto-cancelled: confirmation timeout',
        },
      });
      this.logger.log(`Auto-cancelled order ${data.orderId} due to confirmation timeout`);
    }
  }
}
