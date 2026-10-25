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
  HttpCode,
  ParseUUIDPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentBranch } from '../../common/decorators/current-branch.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RescheduleOrderDto } from './dto/reschedule-order.dto';
import { OrderScheduleQueryDto } from './dto/order-schedule-query.dto';
import { CheckOrderAvailabilityDto } from './dto/check-order-availability.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(PermissionsGuard)
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
  async checkAvailability(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() userBranchId: string | null,
    @Query() query: CheckOrderAvailabilityDto,
  ) {
    if (userBranchId !== null && query.branchId !== userBranchId) {
      throw new ForbiddenException(
        'Cannot check availability for a different branch',
      );
    }
    if (query.excludeOrderId) {
      const order = await this.ordersService.findById(
        tenantId,
        query.excludeOrderId,
        userBranchId,
      );
      if (order.branchId !== query.branchId)
        throw new ForbiddenException(
          'Excluded order belongs to a different branch',
        );
    }
    return this.schedulingService.checkAvailability({
      tenantId,
      ...query,
      date: new Date(query.date),
    });
  }

  @Get('schedule')
  @Permissions('orders.read')
  getSchedule(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Query() query: OrderScheduleQueryDto,
  ) {
    return this.ordersService.getSchedule(tenantId, query, branchId);
  }

  @Patch(':id/reschedule')
  @Permissions('orders.update')
  reschedule(
    @CurrentTenant() tenantId: string,
    @CurrentBranch() branchId: string | null,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.reschedule(tenantId, id, dto, user.sub, branchId);
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
  @HttpCode(201)
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
