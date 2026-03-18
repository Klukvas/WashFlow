import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationProducer {
  private readonly logger = new Logger(NotificationProducer.name);

  constructor(@InjectQueue('notifications') private readonly queue: Queue) {}

  async sendOrderConfirmation(orderId: string, tenantId: string) {
    await this.queue.add(
      'order-confirmation',
      { orderId, tenantId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
  }

  async sendStatusUpdate(orderId: string, tenantId: string) {
    await this.queue.add(
      'status-update',
      { orderId, tenantId },
      { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
    );
  }

  async sendBookingReminder(
    orderId: string,
    tenantId: string,
    scheduledFor: Date,
  ) {
    const delay = scheduledFor.getTime() - Date.now() - 3600000; // 1 hour before
    if (delay > 0) {
      await this.queue.add(
        'booking-reminder',
        { orderId, tenantId },
        { delay, attempts: 2 },
      );
    } else {
      this.logger.warn(
        `Skipping booking reminder for orderId=${orderId}: scheduled time is too soon or already past ` +
          `(scheduledFor=${scheduledFor.toISOString()}, delay=${delay}ms)`,
      );
    }
  }
}
