import {
  Controller,
  Get,
  Post,
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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function extractTenantId(header: string | undefined): string {
  if (!header) {
    throw new BadRequestException('x-carwash-tenant-id header is required');
  }
  if (!UUID_REGEX.test(header)) {
    throw new BadRequestException(
      'x-carwash-tenant-id must be a valid UUID',
    );
  }
  return header;
}

@Controller('public/widget')
@Public()
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class PublicBookingHeaderController {
  constructor(private readonly publicBookingService: PublicBookingService) {}

  @Get('services')
  getServices(@Headers('x-carwash-tenant-id') tenantIdHeader?: string) {
    const tenantId = extractTenantId(tenantIdHeader);
    return this.publicBookingService.getPublicServicesByTenantId(tenantId);
  }

  @Get('branches')
  getBranches(@Headers('x-carwash-tenant-id') tenantIdHeader?: string) {
    const tenantId = extractTenantId(tenantIdHeader);
    return this.publicBookingService.getPublicBranchesByTenantId(tenantId);
  }

  @Get('availability')
  checkAvailability(
    @Headers('x-carwash-tenant-id') tenantIdHeader: string | undefined,
    @Query() dto: CheckAvailabilityDto,
  ) {
    const tenantId = extractTenantId(tenantIdHeader);
    return this.publicBookingService.checkAvailabilityByTenantId(
      tenantId,
      dto,
    );
  }

  @Post('book')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  createBooking(
    @Headers('x-carwash-tenant-id') tenantIdHeader: string | undefined,
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const tenantId = extractTenantId(tenantIdHeader);
    return this.publicBookingService.createBookingByTenantId(
      tenantId,
      dto,
      idempotencyKey,
    );
  }
}
