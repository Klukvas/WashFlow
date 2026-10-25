import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  Headers,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('orders/:orderId/payments')
@UseGuards(PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Permissions('payments.read')
  findByOrder(
    @CurrentTenant() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @CurrentBranch() branchId: string | null,
  ) {
    return this.paymentsService.findByOrderId(tenantId, orderId, branchId);
  }

  @Post()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Permissions('payments.create')
  create(
    @CurrentTenant() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser() user: { sub: string },
    @CurrentBranch() branchId: string | null,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.paymentsService.create(
      tenantId,
      orderId,
      dto,
      user.sub,
      idempotencyKey,
      branchId,
    );
  }
}
