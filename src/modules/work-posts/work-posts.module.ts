import { Module } from '@nestjs/common';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { WorkPostsController } from './work-posts.controller';
import { WorkPostsService } from './work-posts.service';
import { WorkPostsRepository } from './work-posts.repository';

@Module({
  imports: [SubscriptionsModule],
  controllers: [WorkPostsController],
  providers: [WorkPostsService, WorkPostsRepository],
  exports: [WorkPostsService, WorkPostsRepository],
})
export class WorkPostsModule {}
