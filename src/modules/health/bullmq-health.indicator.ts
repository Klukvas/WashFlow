import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { Queue } from 'bullmq';

const QUEUE_NAMES = [
  'notifications',
  'analytics',
  'booking-confirmations',
] as const;

@Injectable()
export class BullMQHealthIndicator extends HealthIndicator {
  private readonly queues: Queue[];

  constructor(
    @InjectQueue('notifications') notifications: Queue,
    @InjectQueue('analytics') analytics: Queue,
    @InjectQueue('booking-confirmations') bookingConfirmations: Queue,
  ) {
    super();
    this.queues = [notifications, analytics, bookingConfirmations];
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const results: Record<string, { status: string }> = {};
    const errors: string[] = [];

    for (let i = 0; i < this.queues.length; i++) {
      const name = QUEUE_NAMES[i];
      try {
        // Ping the underlying Redis connection via the queue client
        const client = await this.queues[i].client;
        await client.ping();
        results[name] = { status: 'up' };
      } catch {
        results[name] = { status: 'down' };
        errors.push(name);
      }
    }

    const isUp = errors.length === 0;
    const status = this.getStatus(key, isUp, results);

    if (!isUp) {
      throw new HealthCheckError(
        `BullMQ health check failed for: ${errors.join(', ')}`,
        status,
      );
    }

    return status;
  }
}
