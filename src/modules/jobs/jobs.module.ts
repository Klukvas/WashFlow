import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationProducer } from './producers/notification.producer';
import { AnalyticsProducer } from './producers/analytics.producer';
import { BookingConfirmationProducer } from './producers/booking-confirmation.producer';
import { NotificationProcessor } from './processors/notification.processor';
import { AnalyticsProcessor } from './processors/analytics.processor';
import { BookingConfirmationProcessor } from './processors/booking-confirmation.processor';
import { JobsSubscriber } from './jobs.subscriber';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notifications' }),
    BullModule.registerQueue({ name: 'analytics' }),
    BullModule.registerQueue({ name: 'booking-confirmations' }),
  ],
  providers: [
    NotificationProducer,
    AnalyticsProducer,
    BookingConfirmationProducer,
    NotificationProcessor,
    AnalyticsProcessor,
    BookingConfirmationProcessor,
    JobsSubscriber,
  ],
  exports: [
    NotificationProducer,
    AnalyticsProducer,
    BookingConfirmationProducer,
  ],
})
export class JobsModule {}
