import { Controller, Get, Post, Param, Body, Query, Headers, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicBookingService } from './public-booking.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('public/booking')
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Get(':tenantSlug/availability')
  checkAvailability(
    @Param('tenantSlug') slug: string,
    @Query() dto: CheckAvailabilityDto,
  ) {
    return this.publicBookingService.checkAvailability(slug, dto);
  }

  @Get(':tenantSlug/services')
  getServices(@Param('tenantSlug') slug: string) {
    return this.publicBookingService.getPublicServices(slug);
  }

  @Get(':tenantSlug/branches')
  getBranches(@Param('tenantSlug') slug: string) {
    return this.publicBookingService.getPublicBranches(slug);
  }

  @Post(':tenantSlug/book')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  createBooking(
    @Param('tenantSlug') slug: string,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.publicBookingService.createBooking(slug, dto, idempotencyKey);
  }
}
