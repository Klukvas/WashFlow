import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ServicesRepository } from '../services/services.repository';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { RescheduleOrderDto } from './dto/reschedule-order.dto';
import { OrderScheduleQueryDto } from './dto/order-schedule-query.dto';
import { OrderRescheduledEvent } from '../../common/events/order-rescheduled.event';
import {
  bookingDayRestrictions,
  branchCalendarDay,
  branchDayRange,
} from '../../common/utils/branch-day.util';
import { OrderQueryDto } from './dto/order-query.dto';
import { OrderCreatedEvent } from './events/order-created.event';
import { OrderStatusChangedEvent } from './events/order-status-changed.event';
import { OrderCancelledEvent } from './events/order-cancelled.event';
import { VALID_STATUS_TRANSITIONS } from './types/order.types';
import { paginatedResponse } from '../../common/utils/pagination.util';
import { resolveBookingSettings } from '../../common/utils/booking-settings.util';
import { reserveEmployee } from './employee-eligibility.util';
import { runReservationTransaction } from './reservation-transaction.util';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersRepo: OrdersRepository,
    private readonly schedulingService: SchedulingService,
    private readonly servicesRepo: ServicesRepository,
    private readonly eventDispatcher: EventDispatcherService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  async findAll(
    tenantId: string,
    query: OrderQueryDto,
    branchId: string | null = null,
  ) {
    const { items, total } = await this.ordersRepo.findAll(
      tenantId,
      query,
      branchId,
    );
    return paginatedResponse(items, total, query);
  }

  async findById(tenantId: string, id: string, branchId: string | null = null) {
    const order = await this.ordersRepo.findById(tenantId, id, branchId);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async create(
    tenantId: string,
    dto: CreateOrderDto,
    userId: string | null,
    idempotencyKey?: string,
    userBranchId: string | null = null,
    anonymousRequest?: Record<string, unknown>,
  ) {
    this.validateBranchScope(dto.branchId, userBranchId);

    const identity =
      idempotencyKey !== undefined
        ? this.idempotencyService.requestIdentity(
            {
              tenantId,
              key: idempotencyKey,
              method: 'POST',
              path: anonymousRequest ? '/public/book' : '/orders',
              kind: 'order-v1',
              actorId: userId,
            },
            anonymousRequest ?? {
              branchId: dto.branchId,
              clientId: dto.clientId,
              vehicleId: dto.vehicleId,
              workPostId: dto.workPostId ?? null,
              assignedEmployeeId: dto.assignedEmployeeId ?? null,
              scheduledStart: new Date(dto.scheduledStart).toISOString(),
              serviceIds: [...(dto.serviceIds ?? [])].sort(),
              source: dto.source || 'INTERNAL',
              notes: dto.notes ?? null,
            },
          )
        : undefined;
    const { order, replay } = await runReservationTransaction(
      this.prisma,
      async (tx) => {
        if (identity) {
          const claim = await this.idempotencyService.claimRequestTx(
            tx,
            identity,
          );
          if (claim.replay) {
            const cached = await tx.order.findFirst({
              where: {
                id: claim.resourceId,
                tenantId,
                branchId: dto.branchId,
                deletedAt: null,
                ...(userBranchId !== null ? { branchId: userBranchId } : {}),
              },
              include: this.createdOrderInclude(),
            });
            if (!cached) throw new NotFoundException('Order not found');
            return { order: cached, replay: true };
          }
        }
        if (!dto.serviceIds || dto.serviceIds.length === 0) {
          throw new BadRequestException('At least one service is required');
        }

        if (dto.scheduledStart && new Date(dto.scheduledStart) < new Date()) {
          throw new BadRequestException('Cannot schedule orders in the past');
        }

        await this.validateClientVehicleOwnership(
          tenantId,
          dto.clientId,
          dto.vehicleId,
          tx,
        );

        const { services, totalPrice, totalDuration } =
          await this.resolveServicesAndPricing(tenantId, dto.serviceIds, tx);

        const scheduledStart = new Date(dto.scheduledStart);
        const scheduledEnd = new Date(
          scheduledStart.getTime() + totalDuration * 60000,
        );

        const bookingSettings = await resolveBookingSettings(
          tx,
          tenantId,
          dto.branchId,
        );

        const branch = await tx.branch.findFirst({
          where: {
            id: dto.branchId,
            tenantId,
            isActive: true,
            deletedAt: null,
          },
          select: { timezone: true },
        });
        if (!branch)
          throw new BadRequestException('Branch not found or inactive');
        this.enforceBookingConstraints(
          scheduledStart,
          bookingSettings.workingDays,
          bookingSettings.maxAdvanceBookingDays,
          branch.timezone ?? 'UTC',
        );

        const source = dto.source || 'INTERNAL';
        const status: OrderStatus =
          source === 'WEB' ? 'BOOKED_PENDING_CONFIRMATION' : 'BOOKED';
        const bufferMinutes = bookingSettings.bufferTimeMinutes;

        const { workPostId, assignedEmployeeId } = await this.reserveResources(
          tx,
          {
            tenantId,
            branchId: dto.branchId,
            // Optional JSON nulls mean automatic assignment on create. Only
            // restoration may preserve a legacy unassigned resource as null.
            workPostId: dto.workPostId ?? undefined,
            assignedEmployeeId: dto.assignedEmployeeId ?? undefined,
            scheduledStart,
            scheduledEnd,
            bufferMinutes,
          },
        );

        const created = await tx.order.create({
          data: {
            tenantId,
            branchId: dto.branchId,
            clientId: dto.clientId,
            vehicleId: dto.vehicleId,
            workPostId,
            assignedEmployeeId,
            createdById: userId,
            status,
            source,
            scheduledStart,
            scheduledEnd,
            totalPrice,
            notes: dto.notes,
            services: {
              create: services.map((s) => ({
                tenantId,
                serviceId: s.id,
                price: s.price,
                quantity: 1,
              })),
            },
          },
          include: this.createdOrderInclude(),
        });

        if (identity) {
          await this.idempotencyService.saveRequestTx(tx, identity, created.id);
        }
        return { order: created, replay: false };
      },
    );

    if (!replay)
      this.eventDispatcher.dispatch(
        new OrderCreatedEvent(tenantId, {
          id: order.id,
          branchId: order.branchId,
          clientId: order.clientId,
          assignedEmployeeId: order.assignedEmployeeId ?? null,
          status: order.status,
          source: order.source,
          scheduledStart: order.scheduledStart,
          scheduledEnd: order.scheduledEnd,
          totalPrice: order.totalPrice,
        }),
      );

    return order;
  }

  async replayPublicBooking(
    tenantId: string,
    branchId: string,
    key: string,
    payload: Record<string, unknown>,
  ) {
    const identity = this.idempotencyService.requestIdentity(
      {
        tenantId,
        key,
        method: 'POST',
        path: '/public/book',
        kind: 'order-v1',
        actorId: null,
      },
      payload,
    );
    if (!identity) return null;
    return this.prisma.$transaction(async (tx) => {
      const claim = await this.idempotencyService.readRequestTx(tx, identity);
      if (!claim || !claim.replay) return null;
      const order = await tx.order.findFirst({
        where: { id: claim.resourceId, tenantId, branchId, deletedAt: null },
        include: this.createdOrderInclude(),
      });
      if (!order) throw new NotFoundException('Order not found');
      return order;
    });
  }

  async getSchedule(
    tenantId: string,
    query: OrderScheduleQueryDto,
    userBranchId: string | null = null,
  ) {
    if (userBranchId !== null && query.branchId !== userBranchId)
      throw new ForbiddenException('Cannot read a different branch schedule');
    const branch = await this.ordersRepo.findBranch(tenantId, query.branchId);
    if (!branch) throw new NotFoundException('Branch not found');
    const timezone = branch.timezone ?? 'UTC';
    const range = branchDayRange(query.date, timezone);
    const now = new Date();
    const rows = await this.ordersRepo.findSchedule(
      tenantId,
      query.branchId,
      range,
      now,
      branchCalendarDay(now, timezone) === query.date,
    );
    return {
      branchId: query.branchId,
      date: query.date,
      timezone,
      range,
      now,
      orders: rows.map((row) => ({
        ...row,
        services: row.services.map((line) => ({ name: line.service.name })),
        assignedEmployee: row.assignedEmployee
          ? {
              id: row.assignedEmployee.id,
              name: `${row.assignedEmployee.user.firstName} ${row.assignedEmployee.user.lastName}`.trim(),
            }
          : null,
        isOverdue: row.status === 'IN_PROGRESS' && row.scheduledEnd < now,
      })),
    };
  }

  async reschedule(
    tenantId: string,
    id: string,
    dto: RescheduleOrderDto,
    userId: string,
    userBranchId: string | null = null,
  ) {
    const { order, updated, changed } = await runReservationTransaction(
      this.prisma,
      async (tx) => {
        await this.ordersRepo.lockOrderTx(tx, tenantId, id, userBranchId);
        const order = await tx.order.findFirst({
          where: {
            id,
            tenantId,
            deletedAt: null,
            ...(userBranchId !== null ? { branchId: userBranchId } : {}),
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (
          !(
            ['BOOKED', 'BOOKED_PENDING_CONFIRMATION'] as OrderStatus[]
          ).includes(order.status)
        )
          throw new BadRequestException(
            'Only booked orders can be rescheduled',
          );
        const scheduledStart = new Date(dto.scheduledStart);
        if (scheduledStart < new Date())
          throw new BadRequestException('Cannot schedule orders in the past');
        const duration =
          order.scheduledEnd.getTime() - order.scheduledStart.getTime();
        if (duration <= 0)
          throw new BadRequestException('Order has an invalid stored duration');
        const scheduledEnd = new Date(scheduledStart.getTime() + duration);
        const branch = await tx.branch.findFirst({
          where: {
            id: order.branchId,
            tenantId,
            isActive: true,
            deletedAt: null,
          },
          select: { timezone: true },
        });
        if (!branch)
          throw new BadRequestException('Branch not found or inactive');
        const settings = await resolveBookingSettings(
          tx,
          tenantId,
          order.branchId,
        );
        this.enforceBookingConstraints(
          scheduledStart,
          settings.workingDays,
          settings.maxAdvanceBookingDays,
          branch.timezone ?? 'UTC',
        );
        const resources = await this.reserveResources(tx, {
          tenantId,
          branchId: order.branchId,
          workPostId:
            dto.workPostId === undefined ? order.workPostId : dto.workPostId,
          assignedEmployeeId:
            dto.assignedEmployeeId === undefined
              ? order.assignedEmployeeId
              : dto.assignedEmployeeId,
          scheduledStart,
          scheduledEnd,
          bufferMinutes: settings.bufferTimeMinutes,
          excludeOrderId: id,
        });
        const changed =
          scheduledStart.getTime() !== order.scheduledStart.getTime() ||
          resources.workPostId !== order.workPostId ||
          resources.assignedEmployeeId !== order.assignedEmployeeId;
        const updated = await this.ordersRepo.rescheduleTx(tx, tenantId, id, {
          scheduledStart,
          scheduledEnd,
          ...resources,
        });
        return { order, updated, changed };
      },
    );
    if (changed)
      this.eventDispatcher.dispatch(
        new OrderRescheduledEvent(tenantId, {
          orderId: id,
          branchId: order.branchId,
          userId,
          previous: {
            scheduledStart: order.scheduledStart,
            scheduledEnd: order.scheduledEnd,
            workPostId: order.workPostId,
            assignedEmployeeId: order.assignedEmployeeId,
          },
          updated: {
            scheduledStart: updated.scheduledStart,
            scheduledEnd: updated.scheduledEnd,
            workPostId: updated.workPostId,
            assignedEmployeeId: updated.assignedEmployeeId,
          },
        }),
      );
    return updated;
  }

  async updateStatus(
    tenantId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
    userId: string,
    branchId: string | null = null,
  ) {
    const { order, updated } = await runReservationTransaction(
      this.prisma,
      async (tx) => {
        await this.ordersRepo.lockOrderTx(tx, tenantId, orderId, branchId);
        const current = await tx.order.findFirst({
          where:
            branchId !== null
              ? { id: orderId, tenantId, branchId, deletedAt: null }
              : { id: orderId, tenantId, deletedAt: null },
        });
        if (!current) throw new NotFoundException('Order not found');

        const allowed = VALID_STATUS_TRANSITIONS[current.status];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(
            `Cannot transition from ${current.status} to ${dto.status}`,
          );
        }

        const data: Prisma.OrderUpdateInput = { status: dto.status };
        if (dto.cancellationReason) {
          data.cancellationReason = dto.cancellationReason;
        }

        const result = await tx.order.update({
          where: { id: orderId, tenantId, deletedAt: null },
          data,
        });

        return { order: current, updated: result };
      },
    );

    this.eventDispatcher.dispatch(
      new OrderStatusChangedEvent(tenantId, {
        orderId,
        branchId: order.branchId,
        previousStatus: order.status,
        newStatus: dto.status,
        userId,
      }),
    );

    if (dto.status === 'CANCELLED') {
      this.eventDispatcher.dispatch(
        new OrderCancelledEvent(tenantId, {
          orderId,
          branchId: order.branchId,
          reason: dto.cancellationReason,
          userId,
        }),
      );
    }

    return updated;
  }

  async softDelete(
    tenantId: string,
    id: string,
    branchId: string | null = null,
  ) {
    await this.findById(tenantId, id, branchId);
    return this.ordersRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string, branchId: string | null = null) {
    return runReservationTransaction(this.prisma, async (tx) => {
      // Transaction clients bypass tenant and soft-delete filtering. Re-read on
      // each retry so no decision relies on an order fetched before the transaction.
      const order = await tx.order.findFirst({
        where: { id, tenantId, ...(branchId !== null ? { branchId } : {}) },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (!order.deletedAt)
        throw new BadRequestException('Order is not deleted');

      const isTerminal = VALID_STATUS_TRANSITIONS[order.status].length === 0;
      const branch = await tx.branch.findFirst({
        where: {
          id: order.branchId,
          tenantId,
          ...(!isTerminal ? { isActive: true, deletedAt: null } : {}),
        },
        select: { id: true },
      });
      if (!branch)
        throw new BadRequestException('Branch not found or inactive');

      if (!isTerminal) {
        const settings = await resolveBookingSettings(
          tx,
          tenantId,
          order.branchId,
        );
        await this.reserveResources(tx, {
          tenantId,
          branchId: order.branchId,
          // Preserve legacy unassigned resources: restoring must not invent assignments.
          workPostId: order.workPostId,
          assignedEmployeeId: order.assignedEmployeeId,
          scheduledStart: order.scheduledStart,
          scheduledEnd: order.scheduledEnd,
          bufferMinutes: settings.bufferTimeMinutes,
        });
      }

      return this.ordersRepo.restoreInTransaction(
        tx,
        tenantId,
        id,
        order.branchId,
        isTerminal || order.workPostId === null,
      );
    });
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private createdOrderInclude() {
    return {
      services: { include: { service: true } },
      client: true,
      vehicle: true,
      branch: true,
      workPost: true,
      assignedEmployee: {
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      },
    } satisfies Prisma.OrderInclude;
  }

  private validateBranchScope(
    targetBranchId: string,
    userBranchId: string | null,
  ): void {
    if (userBranchId !== null && targetBranchId !== userBranchId) {
      throw new BadRequestException(
        'Cannot create orders for a different branch',
      );
    }
  }

  private async resolveServicesAndPricing(
    tenantId: string,
    serviceIds: string[],
    tx: Prisma.TransactionClient,
  ) {
    const services = await this.servicesRepo.findByIds(
      tenantId,
      serviceIds,
      tx,
    );
    if (services.length !== serviceIds.length) {
      throw new BadRequestException(
        'One or more services not found or inactive',
      );
    }

    const totalPrice = services.reduce((sum, s) => sum + Number(s.price), 0);
    const totalDuration = services.reduce((sum, s) => sum + s.durationMin, 0);

    return { services, totalPrice, totalDuration };
  }

  private enforceBookingConstraints(
    scheduledStart: Date,
    workingDays: number[],
    maxAdvanceBookingDays: number,
    timezone: string,
  ): void {
    const restrictions = bookingDayRestrictions(
      branchCalendarDay(scheduledStart, timezone),
      timezone,
      workingDays,
      maxAdvanceBookingDays,
    );
    if (!restrictions.isWorkingDay)
      throw new BadRequestException(
        'Booking is not allowed on this day of the week',
      );
    if (!restrictions.isWithinAdvance)
      throw new BadRequestException(
        `Cannot book more than ${maxAdvanceBookingDays} days in advance`,
      );
  }

  private async validateClientVehicleOwnership(
    tenantId: string,
    clientId: string,
    vehicleId: string,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const client = await tx.client.findFirst({
      where: { id: clientId, tenantId, deletedAt: null },
    });
    if (!client) {
      throw new BadRequestException('Client not found in this tenant');
    }

    const vehicle = await tx.vehicle.findFirst({
      where: { id: vehicleId, tenantId, deletedAt: null },
    });
    if (!vehicle) {
      throw new BadRequestException('Vehicle not found in this tenant');
    }

    if (vehicle.clientId !== clientId) {
      throw new BadRequestException('Vehicle does not belong to this client');
    }
  }

  private async reserveResources(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      branchId: string;
      workPostId?: string | null;
      assignedEmployeeId?: string | null;
      scheduledStart: Date;
      scheduledEnd: Date;
      bufferMinutes: number;
      excludeOrderId?: string;
    },
  ) {
    // All callers lock posts before employees; null preserves a legacy assignment.
    const workPostId =
      params.workPostId === null
        ? null
        : await this.resolveWorkPost(tx, {
            ...params,
            workPostId: params.workPostId,
          });
    const assignedEmployeeId =
      params.assignedEmployeeId === null
        ? null
        : await reserveEmployee(tx, {
            ...params,
            assignedEmployeeId: params.assignedEmployeeId,
          });
    return { workPostId, assignedEmployeeId };
  }

  private async resolveWorkPost(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      branchId: string;
      workPostId?: string;
      scheduledStart: Date;
      scheduledEnd: Date;
      bufferMinutes: number;
      excludeOrderId?: string;
    },
  ): Promise<string> {
    const {
      tenantId,
      branchId,
      workPostId,
      scheduledStart,
      scheduledEnd,
      bufferMinutes,
    } = params;

    // Transaction clients bypass tenant and soft-delete filtering.
    const branch = await tx.branch.findFirst({
      where: { id: branchId, tenantId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }

    const workPostWhere = {
      tenantId,
      branchId,
      isActive: true,
      deletedAt: null,
    };

    if (workPostId) {
      const workPost = await tx.workPost.findFirst({
        where: { id: workPostId, ...workPostWhere },
        select: { id: true },
      });
      if (!workPost) {
        throw new BadRequestException(
          'Work post not found or inactive in this branch',
        );
      }

      await this.schedulingService.reserveSlot(tx, {
        tenantId,
        workPostId,
        scheduledStart,
        scheduledEnd,
        bufferMinutes,
        ...(params.excludeOrderId
          ? { excludeOrderId: params.excludeOrderId }
          : {}),
      });
      return workPostId;
    }

    const workPosts = await tx.workPost.findMany({
      where: workPostWhere,
      orderBy: { id: 'asc' },
    });

    for (const wp of workPosts) {
      try {
        await this.schedulingService.reserveSlot(tx, {
          tenantId,
          workPostId: wp.id,
          scheduledStart,
          scheduledEnd,
          bufferMinutes,
          ...(params.excludeOrderId
            ? { excludeOrderId: params.excludeOrderId }
            : {}),
        });
        return wp.id;
      } catch (err) {
        if (err instanceof ConflictException) continue;
        throw err;
      }
    }

    throw new BadRequestException(
      'No available work posts for the requested time',
    );
  }
}
