import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { PublicBookingService } from './public-booking.service';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ApiTags } from '@nestjs/swagger';

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;

function validateSlug(slug: string): string {
  if (!SLUG_REGEX.test(slug)) {
    throw new BadRequestException('Invalid tenant slug format');
  }
  return slug;
}

@ApiTags('Public Booking')
@Controller('public/booking')
@Public()
export class PublicBookingController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Get(':tenantSlug/availability')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  checkAvailability(
    @Param('tenantSlug') slug: string,
    @Query() dto: CheckAvailabilityDto,
  ) {
    validateSlug(slug);
    return this.publicBookingService.checkAvailability(slug, dto);
  }

  @Get(':tenantSlug/services')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getServices(@Param('tenantSlug') slug: string) {
    validateSlug(slug);
    return this.publicBookingService.getPublicServices(slug);
  }

  @Get(':tenantSlug/branches')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  getBranches(@Param('tenantSlug') slug: string) {
    validateSlug(slug);
    return this.publicBookingService.getPublicBranches(slug);
  }

  @Post(':tenantSlug/book')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createBooking(
    @Param('tenantSlug') slug: string,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    validateSlug(slug);
    return this.publicBookingService.createBooking(slug, dto, idempotencyKey);
  }
}
