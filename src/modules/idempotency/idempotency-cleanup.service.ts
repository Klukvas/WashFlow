import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyCleanupService {
  private readonly logger = new Logger(IdempotencyCleanupService.name);

  constructor(private readonly idempotencyService: IdempotencyService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCleanup() {
    this.logger.log('Cleaning expired idempotency keys...');
    try {
      const result = await this.idempotencyService.cleanExpired();
      this.logger.log(`Deleted ${result.count} expired idempotency keys`);
    } catch (error) {
      this.logger.error(
        'Idempotency key cleanup failed',
        (error as Error).stack,
      );
    }
  }
}
