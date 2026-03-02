import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('notifications')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'order-confirmation':
        await this.handleOrderConfirmation(job.data);
        break;
      case 'status-update':
        await this.handleStatusUpdate(job.data);
        break;
      case 'booking-reminder':
        await this.handleBookingReminder(job.data);
        break;
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleOrderConfirmation(data: {
    orderId: string;
    tenantId: string;
  }) {
    this.logger.log(
      `Sending order confirmation for order ${data.orderId} (tenant: ${data.tenantId})`,
    );
    // Integration point: send email/SMS via external provider
  }

  private async handleStatusUpdate(data: {
    orderId: string;
    tenantId: string;
  }) {
    this.logger.log(
      `Sending status update for order ${data.orderId} (tenant: ${data.tenantId})`,
    );
  }

  private async handleBookingReminder(data: {
    orderId: string;
    tenantId: string;
  }) {
    this.logger.log(
      `Sending booking reminder for order ${data.orderId} (tenant: ${data.tenantId})`,
    );
  }
}
