import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
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
import { OrderQueryDto } from './dto/order-query.dto';
import { OrderCreatedEvent } from './events/order-created.event';
import { OrderStatusChangedEvent } from './events/order-status-changed.event';
import { OrderCancelledEvent } from './events/order-cancelled.event';
import { VALID_STATUS_TRANSITIONS } from './types/order.types';
import { paginatedResponse } from '../../common/utils/pagination.util';
import { resolveBookingSettings } from '../../common/utils/booking-settings.util';
import { reserveEmployee } from './employee-eligibility.util';
import { runReservationTransaction } from './reservation-transaction.util';

const MS_PER_DAY = 86_400_000;

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
  ) {
    this.validateBranchScope(dto.branchId, userBranchId);

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
    );

    const { services, totalPrice, totalDuration } =
      await this.resolveServicesAndPricing(tenantId, dto.serviceIds);

    const scheduledStart = new Date(dto.scheduledStart);
    const scheduledEnd = new Date(
      scheduledStart.getTime() + totalDuration * 60000,
    );

    const bookingSettings = await resolveBookingSettings(
      this.prisma,
      tenantId,
      dto.branchId,
    );

    this.enforceBookingConstraints(
      scheduledStart,
      bookingSettings.workingDays,
      bookingSettings.maxAdvanceBookingDays,
    );

    const source = dto.source || 'INTERNAL';
    const status: OrderStatus =
      source === 'WEB' ? 'BOOKED_PENDING_CONFIRMATION' : 'BOOKED';
    const bufferMinutes = bookingSettings.bufferTimeMinutes;

    const order = await runReservationTransaction(this.prisma, async (tx) => {
      if (idempotencyKey) {
        const cached = await this.idempotencyService.checkTx(
          tx,
          tenantId,
          idempotencyKey,
        );
        if (cached.hit) {
          return cached.cachedResponse!.body as Awaited<
            ReturnType<typeof tx.order.create>
          >;
        }
        const acquired = await this.idempotencyService.acquireLockTx(tx, {
          tenantId,
          key: idempotencyKey,
          method: 'POST',
          path: '/orders',
        });
        if (!acquired) {
          throw new ConflictException('Request is being processed');
        }
      }

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
        include: {
          services: { include: { service: true } },
          client: true,
          vehicle: true,
          branch: true,
          workPost: true,
          assignedEmployee: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (idempotencyKey) {
        await this.idempotencyService.saveResultTx(
          tx,
          tenantId,
          idempotencyKey,
          201,
          created,
        );
      }

      return created;
    });

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

  async updateStatus(
    tenantId: string,
    orderId: string,
    dto: UpdateOrderStatusDto,
    userId: string,
    branchId: string | null = null,
  ) {
    const { order, updated } = await this.prisma.$transaction(
      async (tx) => {
        const current = await tx.order.findFirst({
          where:
            branchId !== null
              ? { id: orderId, tenantId, branchId }
              : { id: orderId, tenantId },
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
          where: { id: orderId, tenantId } as Prisma.OrderWhereUniqueInput,
          data,
        });

        return { order: current, updated: result };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
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
  ) {
    const services = await this.servicesRepo.findByIds(tenantId, serviceIds);
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
  ): void {
    const dayOfWeek = scheduledStart.getUTCDay();
    if (!workingDays.includes(dayOfWeek)) {
      throw new BadRequestException(
        'Booking is not allowed on this day of the week',
      );
    }

    const now = new Date();
    const maxDate = new Date(
      now.getTime() + maxAdvanceBookingDays * MS_PER_DAY,
    );
    if (scheduledStart.getTime() > maxDate.getTime()) {
      throw new BadRequestException(
        `Cannot book more than ${maxAdvanceBookingDays} days in advance`,
      );
    }
  }

  private async validateClientVehicleOwnership(
    tenantId: string,
    clientId: string,
    vehicleId: string,
  ): Promise<void> {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, tenantId },
    });
    if (!client) {
      throw new BadRequestException('Client not found in this tenant');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
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
