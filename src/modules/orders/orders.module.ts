import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ServicesModule } from '../services/services.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [SchedulingModule, ServicesModule, IdempotencyModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService],
})
export class OrdersModule {}
