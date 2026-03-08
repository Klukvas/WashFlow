import { Module } from '@nestjs/common';
import {
  SubscriptionUsageController,
  SubscriptionAdminController,
} from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import { SubscriptionLimitsService } from './subscription-limits.service';

@Module({
  controllers: [SubscriptionUsageController, SubscriptionAdminController],
  providers: [
    SubscriptionsService,
    SubscriptionsRepository,
    SubscriptionLimitsService,
  ],
  exports: [SubscriptionLimitsService, SubscriptionsRepository],
})
export class SubscriptionsModule {}
