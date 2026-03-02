import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class AnalyticsProducer {
  constructor(@InjectQueue('analytics') private readonly queue: Queue) {}

  async recordOrderCreated(tenantId: string, orderData: Record<string, unknown>) {
    await this.queue.add(
      'order-created',
      { tenantId, orderData },
      { removeOnComplete: 200 },
    );
  }

  async recordOrderCompleted(tenantId: string, orderData: Record<string, unknown>) {
    await this.queue.add(
      'order-completed',
      { tenantId, orderData },
      { removeOnComplete: 200 },
    );
  }
}
