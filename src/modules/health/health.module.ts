import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';
import { BullMQHealthIndicator } from './bullmq-health.indicator';

@Module({
  imports: [
    TerminusModule,
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'analytics' }),
    BullModule.registerQueue({ name: 'booking-confirmations' }),
  ],
  controllers: [HealthController],
  providers: [RedisHealthIndicator, BullMQHealthIndicator],
})
export class HealthModule {}
