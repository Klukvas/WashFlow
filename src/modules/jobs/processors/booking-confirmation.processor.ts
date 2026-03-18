import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../../prisma/prisma.service';

interface BookingConfirmationJobData {
  orderId: string;
  tenantId: string;
}

@Processor('booking-confirmations')
export class BookingConfirmationProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingConfirmationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job<BookingConfirmationJobData>): Promise<void> {
    if (job.name === 'confirmation-timeout') {
      await this.handleConfirmationTimeout(job.data);
    }
  }

  private async handleConfirmationTimeout(data: {
    orderId: string;
    tenantId: string;
  }) {
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
  }
}
