import { Module } from '@nestjs/common';
import { WorkPostsController } from './work-posts.controller';
import { WorkPostsService } from './work-posts.service';
import { WorkPostsRepository } from './work-posts.repository';

@Module({
  controllers: [WorkPostsController],
  providers: [WorkPostsService, WorkPostsRepository],
  exports: [WorkPostsService, WorkPostsRepository],
})
export class WorkPostsModule {}
