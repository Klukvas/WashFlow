import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class BookingConfirmationProducer {
  constructor(
    @InjectQueue('booking-confirmations') private readonly queue: Queue,
  ) {}

  async scheduleConfirmationTimeout(
    orderId: string,
    tenantId: string,
    timeoutMinutes: number,
  ) {
    await this.queue.add(
      'confirmation-timeout',
      { orderId, tenantId },
      {
        delay: timeoutMinutes * 60000,
        attempts: 1,
        removeOnComplete: 100,
      },
    );
  }
}
