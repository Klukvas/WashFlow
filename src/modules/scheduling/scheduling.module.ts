import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { SchedulingRepository } from './scheduling.repository';
import { WorkforceModule } from '../workforce/workforce.module';

@Module({
  imports: [WorkforceModule],
  providers: [SchedulingService, SchedulingRepository],
  exports: [SchedulingService],
})
export class SchedulingModule {}
