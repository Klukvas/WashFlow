import { Module } from '@nestjs/common';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { TenantsModule } from '../tenants/tenants.module';
import { OrdersModule } from '../orders/orders.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ServicesModule } from '../services/services.module';
import { BranchesModule } from '../branches/branches.module';

@Module({
  imports: [TenantsModule, OrdersModule, SchedulingModule, ServicesModule, BranchesModule],
  controllers: [PublicBookingController],
  providers: [PublicBookingService],
})
export class PublicBookingModule {}
