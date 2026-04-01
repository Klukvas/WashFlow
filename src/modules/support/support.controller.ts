import { Controller, Post, Body } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { SupportService } from './support.service';
import { CreateSupportRequestDto } from './dto/create-support-request.dto';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @Public()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  async create(
    @CurrentTenant() tenantId: string | undefined,
    @CurrentUser() user: JwtPayload | undefined,
    @Body() dto: CreateSupportRequestDto,
  ) {
    await this.supportService.createRequest(dto, {
      tenantId: tenantId ?? 'anonymous',
      userId: user?.sub ?? 'anonymous',
      userEmail: user?.email ?? dto.email ?? 'anonymous',
    });

    return { message: 'Support request sent' };
  }
}
