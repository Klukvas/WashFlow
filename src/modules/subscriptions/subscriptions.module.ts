import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import {
  SubscriptionStatusController,
  SubscriptionUsageController,
  SubscriptionAdminController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { PaddleService } from './paddle.service';
import { PaddleWebhookController } from './paddle-webhook.controller';
import { PaddleWebhookService } from './paddle-webhook.service';
import { WEBHOOK_REDIS, PRICE_CACHE_REDIS } from './subscriptions.constants';
import { PaddlePriceCacheService } from './paddle-price-cache.service';

@Module({
  controllers: [
    SubscriptionStatusController,
    SubscriptionUsageController,
    SubscriptionAdminController,
    PaddleWebhookController,
  ],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionLimitsService,
    PaddleService,
    PaddleWebhookService,
    PaddlePriceCacheService,
    {
      provide: WEBHOOK_REDIS,
      useFactory: (config: ConfigService) => {
        return new Redis(config.get<string>('redis.url')!, {
          keyPrefix: 'paddle:webhook:',
          maxRetriesPerRequest: 3,
        });
      },
      inject: [ConfigService],
    },
    {
      provide: PRICE_CACHE_REDIS,
      useFactory: (config: ConfigService) => {
        return new Redis(config.get<string>('redis.url')!, {
          keyPrefix: 'paddle:prices:',
          maxRetriesPerRequest: 3,
        });
      },
      inject: [ConfigService],
    },
  ],
  exports: [SubscriptionLimitsService, SubscriptionsRepository],
})
export class SubscriptionsModule {}
