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
    // Enforce branch scope on creation
    if (userBranchId !== null && dto.branchId !== userBranchId) {
      throw new BadRequestException(
        'Cannot create orders for a different branch',
      );
    }

    // 1. Validate services exist and are active
    const services = await this.servicesRepo.findByIds(
      tenantId,
      dto.serviceIds,
    );
    if (services.length !== dto.serviceIds.length) {
      throw new BadRequestException(
        'One or more services not found or inactive',
      );
    }

    // 2. Calculate total price and duration
    const totalPrice = services.reduce((sum, s) => sum + Number(s.price), 0);
    const totalDuration = services.reduce((sum, s) => sum + s.durationMin, 0);

    // 3. Calculate scheduled end
    const scheduledStart = new Date(dto.scheduledStart);
    const scheduledEnd = new Date(
      scheduledStart.getTime() + totalDuration * 60000,
    );

    // 4. Load booking settings for buffer time (branch-level → tenant → defaults)
    const bookingSettings = await resolveBookingSettings(
      this.prisma,
      tenantId,
      dto.branchId,
    );
    const bufferMinutes = bookingSettings.bufferTimeMinutes;

    // 4b. Enforce workingDays
    const dayOfWeek = scheduledStart.getUTCDay();
    if (!bookingSettings.workingDays.includes(dayOfWeek)) {
      throw new BadRequestException(
        'Booking is not allowed on this day of the week',
      );
    }

    // 4c. Enforce maxAdvanceBookingDays
    const now = new Date();
    const maxDate = new Date(
      now.getTime() + bookingSettings.maxAdvanceBookingDays * 86400000,
    );
    if (scheduledStart.getTime() > maxDate.getTime()) {
      throw new BadRequestException(
        `Cannot book more than ${bookingSettings.maxAdvanceBookingDays} days in advance`,
      );
    }

    // 5. Determine source and initial status
    const source = dto.source || 'INTERNAL';
    const status: OrderStatus =
      source === 'WEB' ? 'BOOKED_PENDING_CONFIRMATION' : 'BOOKED';

    // 6. Transaction: idempotency check + auto-assign work post + lock slot + create order atomically
    let workPostId = dto.workPostId;

    const order = await this.prisma.$transaction(
      async (tx) => {
        // 6a. Idempotency check (if key provided)
        if (idempotencyKey) {
          const cached = await this.idempotencyService.checkTx(
            tx,
            tenantId,
            idempotencyKey,
          );
          if (cached.hit) {
            return cached.cachedResponse!.body as any;
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

        // 6b. Auto-assign work post inside transaction if not specified
        if (!workPostId) {
          const workPosts = await tx.workPost.findMany({
            where: { tenantId, branchId: dto.branchId, isActive: true },
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
              workPostId = wp.id;
              break;
            } catch (err) {
              if (err instanceof ConflictException) continue;
              throw err;
            }
          }

          if (!workPostId) {
            throw new BadRequestException(
              'No available work posts for the requested time',
            );
          }
        } else {
          // 6c. Lock slot for explicitly provided work post
          await this.schedulingService.reserveSlot(tx, {
            tenantId,
            workPostId,
            scheduledStart,
            scheduledEnd,
            bufferMinutes,
          });
        }

        // 6d. Auto-assign employee if workforce is configured for this branch
        let assignedEmployeeId: string | undefined = dto.assignedEmployeeId;

        if (!assignedEmployeeId) {
          const totalProfiles = await tx.employeeProfile.count({
            where: {
              tenantId,
              branchId: dto.branchId,
              active: true,
              workStartTime: { not: null },
            },
          });

          if (totalProfiles > 0) {
            const pad = (n: number) => String(n).padStart(2, '0');
            const startHH = `${pad(scheduledStart.getUTCHours())}:${pad(scheduledStart.getUTCMinutes())}`;
            const endHH = `${pad(scheduledEnd.getUTCHours())}:${pad(scheduledEnd.getUTCMinutes())}`;

            const bufferedStart = new Date(
              scheduledStart.getTime() - bufferMinutes * 60000,
            );
            const bufferedEnd = new Date(
              scheduledEnd.getTime() + bufferMinutes * 60000,
            );

            const availableEmployee = await tx.employeeProfile.findFirst({
              where: {
                tenantId,
                branchId: dto.branchId,
                isWorker: true,
                active: true,
                workStartTime: { lte: startHH },
                workEndTime: { gte: endHH },
                user: { deletedAt: null },
                branch: { deletedAt: null },
                orders: {
                  none: {
                    status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
                    scheduledStart: { lt: bufferedEnd },
                    scheduledEnd: { gt: bufferedStart },
                    deletedAt: null,
                  },
                },
              },
              select: { id: true },
            });

            if (!availableEmployee) {
              throw new BadRequestException(
                'No available employees for the requested time',
              );
            }

            assignedEmployeeId = availableEmployee.id;
          }
        } // end if (!assignedEmployeeId)

        // 6e. Create order
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

        // 6f. Save idempotency result
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
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 10000,
      },
    );

    // 7. Dispatch event OUTSIDE transaction
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
    const order = await this.findById(tenantId, orderId, branchId);

    const allowed = VALID_STATUS_TRANSITIONS[order.status];
    if (!allowed.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${dto.status}`,
      );
    }

    const updated = await this.ordersRepo.updateStatus(
      tenantId,
      orderId,
      dto.status,
      dto.cancellationReason,
    );

    // Dispatch status change event
    this.eventDispatcher.dispatch(
      new OrderStatusChangedEvent(tenantId, {
        orderId,
        branchId: order.branchId,
        previousStatus: order.status,
        newStatus: dto.status,
        userId,
      }),
    );

    // If cancelled, dispatch cancellation event
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
    const order = await this.ordersRepo.findByIdIncludeDeleted(tenantId, id);
    if (!order) throw new NotFoundException('Order not found');
    if (branchId !== null && order.branchId !== branchId) {
      throw new NotFoundException('Order not found');
    }
    if (!order.deletedAt) throw new BadRequestException('Order is not deleted');

    // Check for scheduling conflicts if order is non-terminal and has a work post
    const terminalStatuses = ['COMPLETED', 'CANCELLED', 'NO_SHOW'];
    if (
      order.workPostId &&
      order.scheduledStart &&
      order.scheduledEnd &&
      !terminalStatuses.includes(order.status)
    ) {
      const bookingSettings = await resolveBookingSettings(
        this.prisma,
        tenantId,
        order.branchId,
      );
      const noOverlap = await this.schedulingService.validateNoOverlap(
        tenantId,
        order.workPostId,
        order.scheduledStart,
        order.scheduledEnd,
        bookingSettings.bufferTimeMinutes,
      );
      if (!noOverlap) {
        throw new ConflictException(
          'Cannot restore: the time slot is now occupied by another order',
        );
      }
    }

    return this.ordersRepo.restore(tenantId, id);
  }
}
