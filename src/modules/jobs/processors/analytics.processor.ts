import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('analytics')
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'order-created':
        this.logger.log(`Processing analytics for new order in tenant ${job.data.tenantId}`);
        // Aggregate order stats, update counters, etc.
        break;
      case 'order-completed':
        this.logger.log(`Processing analytics for completed order in tenant ${job.data.tenantId}`);
        break;
      default:
        this.logger.warn(`Unknown analytics job: ${job.name}`);
    }
  }
}
