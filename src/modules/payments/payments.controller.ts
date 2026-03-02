import { Controller, Get, Post, Param, Body, ParseUUIDPipe, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('orders/:orderId/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Permissions('payments.read')
  findByOrder(
    @CurrentTenant() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ) {
    return this.paymentsService.findByOrderId(tenantId, orderId);
  }

  @Post()
  @Permissions('payments.create')
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentTenant() tenantId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(tenantId, orderId, dto);
  }
}
