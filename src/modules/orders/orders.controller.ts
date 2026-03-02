import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { SchedulingService } from '../scheduling/scheduling.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly schedulingService: SchedulingService,
  ) {}

  @Get()
  @Permissions('orders.read')
  findAll(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: OrderQueryDto,
  ) {
    return this.ordersService.findAll(tenantId, query, branchId);
  }

  @Get('availability')
  @Permissions('scheduling.read')
  checkAvailability(
    @CurrentTenant() tenantId: string,
    @Query('branchId', ParseUUIDPipe) branchId: string,
    @Query('date') date: string,
    @Query('durationMinutes') durationMinutes?: string,
    @Query('workPostId') workPostId?: string,
    @Query('assignedEmployeeId') assignedEmployeeId?: string,
  ) {
    return this.schedulingService.checkAvailability({
      tenantId,
      branchId,
      workPostId,
      assignedEmployeeId,
      date: new Date(date),
      durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : 30,
    });
  }

  @Get(':id')
  @Permissions('orders.read')
  findOne(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.findById(tenantId, id, branchId);
  }

  @Post()
  @Permissions('orders.create')
  create(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.create(
      tenantId,
      dto,
      user.sub,
      idempotencyKey,
      branchId,
    );
  }

  @Patch(':id/status')
  @Permissions('orders.update')
  updateStatus(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.updateStatus(
      tenantId,
      id,
      dto,
      user.sub,
      branchId,
    );
  }

  @Delete(':id')
  @Permissions('orders.delete')
  remove(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.softDelete(tenantId, id, branchId);
  }

  @Patch(':id/restore')
  @Permissions('orders.update')
  restore(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.ordersService.restore(tenantId, id, branchId);
  }
}
