import { Injectable, OnModuleDestroy } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator
  extends HealthIndicator
  implements OnModuleDestroy
{
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    super();
    this.redis = new Redis(config.get<string>('redis.url')!, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true,
    });
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return this.getStatus(key, true);
    } catch {
      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, { message: 'connection failed' }),
      );
    }
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
