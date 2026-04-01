import { Controller, Post, Body, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
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
    @Req() req: Request & { user?: JwtPayload },
    @Body() dto: CreateSupportRequestDto,
  ) {
    const user = req.user;

    await this.supportService.createRequest(dto, {
      tenantId: user?.tenantId ?? 'anonymous',
      userId: user?.sub ?? 'anonymous',
      userEmail: user?.email ?? dto.email ?? 'anonymous',
    });

    return { message: 'Support request sent' };
  }
}
