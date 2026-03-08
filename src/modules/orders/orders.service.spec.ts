import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { SchedulingService } from '../scheduling/scheduling.service';
import { ServicesRepository } from '../services/services.repository';
import { EventDispatcherService } from '../../common/events/event-dispatcher.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderCreatedEvent } from './events/order-created.event';
import { OrderStatusChangedEvent } from './events/order-status-changed.event';
import { OrderCancelledEvent } from './events/order-cancelled.event';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';

// ---------------------------------------------------------------------------
// Shared fixture factories
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-uuid-1';
const BRANCH_ID = 'branch-uuid-1';
const ORDER_ID = 'order-uuid-1';
const USER_ID = 'user-uuid-1';
const WORK_POST_ID = 'workpost-uuid-1';
const SERVICE_ID_1 = 'service-uuid-1';
const SERVICE_ID_2 = 'service-uuid-2';

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    tenantId: TENANT_ID,
    branchId: BRANCH_ID,
    clientId: 'client-uuid-1',
    vehicleId: 'vehicle-uuid-1',
    workPostId: WORK_POST_ID,
    status: 'BOOKED',
    source: 'INTERNAL',
    scheduledStart: new Date('2026-03-01T10:00:00Z'),
    scheduledEnd: new Date('2026-03-01T11:00:00Z'),
    totalPrice: 100,
    notes: null,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeService(id: string, price = 50, durationMin = 30) {
  return { id, price, durationMin, name: `Service ${id}`, isActive: true };
}

function makeQuery(overrides: Partial<OrderQueryDto> = {}): OrderQueryDto {
  return {
    page: 1,
    limit: 20,
    sortOrder: 'asc',
    ...overrides,
  } as OrderQueryDto;
}

function makeCreateDto(
  overrides: Partial<CreateOrderDto> = {},
): CreateOrderDto {
  return {
    branchId: BRANCH_ID,
    clientId: 'client-uuid-1',
    vehicleId: 'vehicle-uuid-1',
    workPostId: WORK_POST_ID,
    scheduledStart: '2026-03-01T10:00:00Z',
    serviceIds: [SERVICE_ID_1],
    ...overrides,
  } as CreateOrderDto;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('OrdersService', () => {
  let service: OrdersService;

  // Typed mock handles
  let prisma: {
    $transaction: jest.Mock;
    bookingSettings: { findUnique: jest.Mock; findFirst: jest.Mock };
    workPost: { findMany: jest.Mock };
  };
  let mockTx: {
    order: { create: jest.Mock };
    employeeProfile: { count: jest.Mock; findFirst: jest.Mock };
    workPost: { findMany: jest.Mock };
  };
  let ordersRepo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByIdIncludeDeleted: jest.Mock;
    updateStatus: jest.Mock;
    softDelete: jest.Mock;
    restore: jest.Mock;
  };
  let schedulingService: {
    reserveSlot: jest.Mock;
    validateNoOverlap: jest.Mock;
  };
  let servicesRepo: { findByIds: jest.Mock };
  let eventDispatcher: { dispatch: jest.Mock };
  let idempotencyService: {
    checkTx: jest.Mock;
    acquireLockTx: jest.Mock;
    saveResultTx: jest.Mock;
  };

  beforeEach(async () => {
    mockTx = {
      order: { create: jest.fn() },
      employeeProfile: {
        count: jest.fn().mockResolvedValue(0), // zero profiles → skip auto-assign
        findFirst: jest.fn().mockResolvedValue(null),
      },
      workPost: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const defaultBookingSettings = {
      slotDurationMinutes: 30,
      bufferTimeMinutes: 10,
      workingHoursStart: '08:00',
      workingHoursEnd: '20:00',
      workingDays: [0, 1, 2, 3, 4, 5, 6],
      maxAdvanceBookingDays: 365,
      allowOnlineBooking: true,
    };

    prisma = {
      $transaction: jest.fn((fn) => fn(mockTx)),
      bookingSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(defaultBookingSettings),
      },
      workPost: { findMany: jest.fn().mockResolvedValue([]) },
    };

    ordersRepo = {
      findAll: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      findById: jest.fn(),
      findByIdIncludeDeleted: jest.fn(),
      updateStatus: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
    };

    schedulingService = {
      reserveSlot: jest.fn().mockResolvedValue(undefined),
      validateNoOverlap: jest.fn().mockResolvedValue(true),
    };

    servicesRepo = {
      findByIds: jest.fn(),
    };

    eventDispatcher = {
      dispatch: jest.fn(),
    };

    idempotencyService = {
      checkTx: jest.fn().mockResolvedValue({ hit: false }),
      acquireLockTx: jest.fn().mockResolvedValue(true),
      saveResultTx: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrdersRepository, useValue: ordersRepo },
        { provide: SchedulingService, useValue: schedulingService },
        { provide: ServicesRepository, useValue: servicesRepo },
        { provide: EventDispatcherService, useValue: eventDispatcher },
        { provide: IdempotencyService, useValue: idempotencyService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Smoke test
  // =========================================================================

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // =========================================================================
  // findAll
  // =========================================================================

  describe('findAll', () => {
    it('returns a paginated response with items and metadata', async () => {
      const items = [makeOrder()];
      ordersRepo.findAll.mockResolvedValue({ items, total: 1 });
      const query = makeQuery({ page: 1, limit: 20 });

      const result = await service.findAll(TENANT_ID, query);

      expect(result).toEqual({
        items,
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
    });

    it('forwards tenantId, query, and null branchId to repository', async () => {
      const query = makeQuery();
      await service.findAll(TENANT_ID, query);

      expect(ordersRepo.findAll).toHaveBeenCalledTimes(1);
      expect(ordersRepo.findAll).toHaveBeenCalledWith(TENANT_ID, query, null);
    });

    it('forwards explicit branchId to repository for scoped access', async () => {
      const query = makeQuery();
      await service.findAll(TENANT_ID, query, BRANCH_ID);

      expect(ordersRepo.findAll).toHaveBeenCalledWith(
        TENANT_ID,
        query,
        BRANCH_ID,
      );
    });

    it('returns empty items array and zero total when no orders exist', async () => {
      ordersRepo.findAll.mockResolvedValue({ items: [], total: 0 });
      const query = makeQuery();

      const result = await service.findAll(TENANT_ID, query);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
    });

    it('calculates totalPages correctly for multi-page results', async () => {
      ordersRepo.findAll.mockResolvedValue({
        items: new Array(20).fill(makeOrder()),
        total: 45,
      });
      const query = makeQuery({ page: 1, limit: 20 });

      const result = await service.findAll(TENANT_ID, query);

      expect(result.totalPages).toBe(3);
    });

    it('calculates correct page and limit for second page', async () => {
      const items = [makeOrder()];
      ordersRepo.findAll.mockResolvedValue({ items, total: 21 });
      const query = makeQuery({ page: 2, limit: 20 });

      const result = await service.findAll(TENANT_ID, query);

      expect(result.page).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.totalPages).toBe(2);
    });
  });

  // =========================================================================
  // findById
  // =========================================================================

  describe('findById', () => {
    it('returns the order when found', async () => {
      const order = makeOrder();
      ordersRepo.findById.mockResolvedValue(order);

      const result = await service.findById(TENANT_ID, ORDER_ID);

      expect(result).toEqual(order);
    });

    it('forwards tenantId, id, and null branchId to repository', async () => {
      ordersRepo.findById.mockResolvedValue(makeOrder());

      await service.findById(TENANT_ID, ORDER_ID);

      expect(ordersRepo.findById).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
        null,
      );
    });

    it('forwards explicit branchId for scoped access', async () => {
      ordersRepo.findById.mockResolvedValue(makeOrder());

      await service.findById(TENANT_ID, ORDER_ID, BRANCH_ID);

      expect(ordersRepo.findById).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
        BRANCH_ID,
      );
    });

    it('throws NotFoundException when repository returns null', async () => {
      ordersRepo.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, ORDER_ID)).rejects.toThrow(
        new NotFoundException('Order not found'),
      );
    });

    it('throws NotFoundException when repository returns undefined', async () => {
      ordersRepo.findById.mockResolvedValue(undefined);

      await expect(service.findById(TENANT_ID, ORDER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // =========================================================================
  // create
  // =========================================================================

  describe('create', () => {
    it('creates an order and dispatches OrderCreatedEvent on success', async () => {
      const svc = makeService(SERVICE_ID_1, 100, 60);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      const created = makeOrder({ totalPrice: 100 });
      mockTx.order.create.mockResolvedValue(created);
      const dto = makeCreateDto();

      const result = await service.create(TENANT_ID, dto, USER_ID);

      expect(result).toEqual(created);
      expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(eventDispatcher.dispatch).toHaveBeenCalledWith(
        expect.any(OrderCreatedEvent),
      );
    });

    it('throws BadRequestException when userBranchId does not match dto.branchId', async () => {
      const dto = makeCreateDto({ branchId: BRANCH_ID });

      await expect(
        service.create(TENANT_ID, dto, USER_ID, undefined, 'other-branch-uuid'),
      ).rejects.toThrow(
        new BadRequestException('Cannot create orders for a different branch'),
      );
    });

    it('does not throw when userBranchId is null (tenant-level access)', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto();

      await expect(
        service.create(TENANT_ID, dto, USER_ID, undefined, null),
      ).resolves.not.toThrow();
    });

    it('does not throw when userBranchId matches dto.branchId', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto({ branchId: BRANCH_ID });

      await expect(
        service.create(TENANT_ID, dto, USER_ID, undefined, BRANCH_ID),
      ).resolves.not.toThrow();
    });

    it('throws BadRequestException when fewer services are found than requested', async () => {
      // Request 2 services, but repository only returns 1
      servicesRepo.findByIds.mockResolvedValue([makeService(SERVICE_ID_1)]);
      const dto = makeCreateDto({ serviceIds: [SERVICE_ID_1, SERVICE_ID_2] });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        new BadRequestException('One or more services not found or inactive'),
      );
    });

    it('throws BadRequestException when no services are found at all', async () => {
      servicesRepo.findByIds.mockResolvedValue([]);
      const dto = makeCreateDto({ serviceIds: [SERVICE_ID_1] });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('validates services before entering the transaction', async () => {
      servicesRepo.findByIds.mockResolvedValue([]);
      const dto = makeCreateDto({ serviceIds: [SERVICE_ID_1] });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow();

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sets status to BOOKED for INTERNAL source', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      const created = makeOrder({ status: 'BOOKED', source: 'INTERNAL' });
      mockTx.order.create.mockResolvedValue(created);
      const dto = makeCreateDto({ source: 'INTERNAL' as any });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'BOOKED',
            source: 'INTERNAL',
          }),
        }),
      );
    });

    it('sets status to BOOKED_PENDING_CONFIRMATION for WEB source', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      const created = makeOrder({
        status: 'BOOKED_PENDING_CONFIRMATION',
        source: 'WEB',
      });
      mockTx.order.create.mockResolvedValue(created);
      const dto = makeCreateDto({ source: 'WEB' as any });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'BOOKED_PENDING_CONFIRMATION',
          }),
        }),
      );
    });

    it('defaults source to INTERNAL when not specified', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto({ source: undefined });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ source: 'INTERNAL' }),
        }),
      );
    });

    it('calculates totalPrice as sum of all service prices', async () => {
      const svcs = [
        makeService(SERVICE_ID_1, 60, 30),
        makeService(SERVICE_ID_2, 40, 30),
      ];
      servicesRepo.findByIds.mockResolvedValue(svcs);
      mockTx.order.create.mockResolvedValue(makeOrder({ totalPrice: 100 }));
      const dto = makeCreateDto({ serviceIds: [SERVICE_ID_1, SERVICE_ID_2] });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ totalPrice: 100 }),
        }),
      );
    });

    it('uses buffer time from bookingSettings when available', async () => {
      prisma.bookingSettings.findUnique.mockResolvedValue({
        slotDurationMinutes: 30,
        bufferTimeMinutes: 15,
        workingHoursStart: '08:00',
        workingHoursEnd: '20:00',
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        maxAdvanceBookingDays: 365,
        allowOnlineBooking: true,
      });
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      // workPostId already provided in dto, so no auto-assign loop
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto();

      await service.create(TENANT_ID, dto, USER_ID);

      // reserveSlot should be called with bufferMinutes: 15
      expect(schedulingService.reserveSlot).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ bufferMinutes: 15 }),
      );
    });

    it('defaults buffer time to 10 when bookingSettings is null', async () => {
      prisma.bookingSettings.findUnique.mockResolvedValue(null);
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto();

      await service.create(TENANT_ID, dto, USER_ID);

      expect(schedulingService.reserveSlot).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({ bufferMinutes: 10 }),
      );
    });

    it('auto-assigns workPostId from first available work post when not provided in dto', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      const workPost = {
        id: WORK_POST_ID,
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        isActive: true,
      };
      mockTx.workPost.findMany.mockResolvedValue([workPost]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto({ workPostId: undefined });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workPostId: WORK_POST_ID }),
        }),
      );
    });

    it('throws BadRequestException when no work posts are available', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.workPost.findMany.mockResolvedValue([
        {
          id: WORK_POST_ID,
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          isActive: true,
        },
      ]);
      schedulingService.reserveSlot.mockRejectedValue(
        new ConflictException('slot overlap'),
      );
      const dto = makeCreateDto({ workPostId: undefined });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        new BadRequestException(
          'No available work posts for the requested time',
        ),
      );
    });

    it('throws BadRequestException when work posts list is empty', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.workPost.findMany.mockResolvedValue([]);
      const dto = makeCreateDto({ workPostId: undefined });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        new BadRequestException(
          'No available work posts for the requested time',
        ),
      );
    });

    it('picks the first available work post when multiple exist', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      const busyPost = {
        id: 'busy-post',
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        isActive: true,
      };
      const freePost = {
        id: 'free-post',
        tenantId: TENANT_ID,
        branchId: BRANCH_ID,
        isActive: true,
      };
      mockTx.workPost.findMany.mockResolvedValue([busyPost, freePost]);
      schedulingService.reserveSlot
        .mockRejectedValueOnce(new ConflictException('slot overlap'))
        .mockResolvedValueOnce(undefined);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto({ workPostId: undefined });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workPostId: 'free-post' }),
        }),
      );
    });

    it('calls reserveSlot inside the transaction with correct arguments', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto();

      await service.create(TENANT_ID, dto, USER_ID);

      expect(schedulingService.reserveSlot).toHaveBeenCalledWith(
        mockTx,
        expect.objectContaining({
          tenantId: TENANT_ID,
          workPostId: WORK_POST_ID,
        }),
      );
    });

    it('does not call idempotency services when idempotencyKey is undefined', async () => {
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto();

      await service.create(TENANT_ID, dto, USER_ID, undefined);

      expect(idempotencyService.checkTx).not.toHaveBeenCalled();
      expect(idempotencyService.acquireLockTx).not.toHaveBeenCalled();
      expect(idempotencyService.saveResultTx).not.toHaveBeenCalled();
    });

    it('calls idempotency services when idempotencyKey is provided and is a cache miss', async () => {
      idempotencyService.checkTx.mockResolvedValue({ hit: false });
      idempotencyService.acquireLockTx.mockResolvedValue(true);
      const svc = makeService(SERVICE_ID_1);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      const created = makeOrder();
      mockTx.order.create.mockResolvedValue(created);
      const dto = makeCreateDto();

      await service.create(TENANT_ID, dto, USER_ID, 'idem-key-123');

      expect(idempotencyService.checkTx).toHaveBeenCalledWith(
        mockTx,
        TENANT_ID,
        'idem-key-123',
      );
      expect(idempotencyService.acquireLockTx).toHaveBeenCalled();
      expect(idempotencyService.saveResultTx).toHaveBeenCalledWith(
        mockTx,
        TENANT_ID,
        'idem-key-123',
        201,
        created,
      );
    });

    it('returns cached response immediately on idempotency cache hit', async () => {
      const cachedOrder = makeOrder({ id: 'cached-order' });
      idempotencyService.checkTx.mockResolvedValue({
        hit: true,
        cachedResponse: { body: cachedOrder },
      });
      servicesRepo.findByIds.mockResolvedValue([makeService(SERVICE_ID_1)]);
      const dto = makeCreateDto();

      const result = await service.create(
        TENANT_ID,
        dto,
        USER_ID,
        'idem-key-123',
      );

      expect(result).toEqual(cachedOrder);
      expect(mockTx.order.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when idempotency lock cannot be acquired', async () => {
      idempotencyService.checkTx.mockResolvedValue({ hit: false });
      idempotencyService.acquireLockTx.mockResolvedValue(false);
      servicesRepo.findByIds.mockResolvedValue([makeService(SERVICE_ID_1)]);
      const dto = makeCreateDto();

      // $transaction re-throws what the callback throws
      prisma.$transaction.mockImplementation(
        (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx),
      );

      await expect(
        service.create(TENANT_ID, dto, USER_ID, 'idem-key-concurrent'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // =========================================================================
  // updateStatus
  // =========================================================================

  describe('updateStatus', () => {
    const makeUpdateDto = (
      status: string,
      cancellationReason?: string,
    ): UpdateOrderStatusDto =>
      ({ status, cancellationReason }) as UpdateOrderStatusDto;

    it('updates status and dispatches OrderStatusChangedEvent', async () => {
      const order = makeOrder({ status: 'BOOKED' });
      ordersRepo.findById.mockResolvedValue(order);
      const updated = makeOrder({ status: 'IN_PROGRESS' });
      ordersRepo.updateStatus.mockResolvedValue(updated);
      const dto = makeUpdateDto('IN_PROGRESS');

      const result = await service.updateStatus(
        TENANT_ID,
        ORDER_ID,
        dto,
        USER_ID,
      );

      expect(result).toEqual(updated);
      expect(eventDispatcher.dispatch).toHaveBeenCalledWith(
        expect.any(OrderStatusChangedEvent),
      );
    });

    it('dispatches OrderStatusChangedEvent with correct payload fields', async () => {
      const order = makeOrder({ status: 'BOOKED' });
      ordersRepo.findById.mockResolvedValue(order);
      ordersRepo.updateStatus.mockResolvedValue(
        makeOrder({ status: 'IN_PROGRESS' }),
      );
      const dto = makeUpdateDto('IN_PROGRESS');

      await service.updateStatus(TENANT_ID, ORDER_ID, dto, USER_ID);

      const dispatchedEvent: OrderStatusChangedEvent =
        eventDispatcher.dispatch.mock.calls[0][0];
      expect(dispatchedEvent.tenantId).toBe(TENANT_ID);
      expect(dispatchedEvent.payload).toEqual(
        expect.objectContaining({
          orderId: ORDER_ID,
          branchId: BRANCH_ID,
          previousStatus: 'BOOKED',
          newStatus: 'IN_PROGRESS',
          userId: USER_ID,
        }),
      );
    });

    it('dispatches both OrderStatusChangedEvent and OrderCancelledEvent when status is CANCELLED', async () => {
      const order = makeOrder({ status: 'BOOKED' });
      ordersRepo.findById.mockResolvedValue(order);
      ordersRepo.updateStatus.mockResolvedValue(
        makeOrder({ status: 'CANCELLED' }),
      );
      const dto = makeUpdateDto('CANCELLED', 'Client request');

      await service.updateStatus(TENANT_ID, ORDER_ID, dto, USER_ID);

      expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(2);
      expect(eventDispatcher.dispatch).toHaveBeenCalledWith(
        expect.any(OrderStatusChangedEvent),
      );
      expect(eventDispatcher.dispatch).toHaveBeenCalledWith(
        expect.any(OrderCancelledEvent),
      );
    });

    it('dispatches OrderCancelledEvent with correct payload when cancelled', async () => {
      const order = makeOrder({ status: 'BOOKED' });
      ordersRepo.findById.mockResolvedValue(order);
      ordersRepo.updateStatus.mockResolvedValue(
        makeOrder({ status: 'CANCELLED' }),
      );
      const dto = makeUpdateDto('CANCELLED', 'Client request');

      await service.updateStatus(TENANT_ID, ORDER_ID, dto, USER_ID);

      const cancelledEvent: OrderCancelledEvent =
        eventDispatcher.dispatch.mock.calls.find(
          ([e]) => e instanceof OrderCancelledEvent,
        )![0];
      expect(cancelledEvent.payload).toEqual(
        expect.objectContaining({
          orderId: ORDER_ID,
          branchId: BRANCH_ID,
          reason: 'Client request',
          userId: USER_ID,
        }),
      );
    });

    it('does not dispatch OrderCancelledEvent for non-CANCELLED transitions', async () => {
      const order = makeOrder({ status: 'BOOKED' });
      ordersRepo.findById.mockResolvedValue(order);
      ordersRepo.updateStatus.mockResolvedValue(
        makeOrder({ status: 'IN_PROGRESS' }),
      );
      const dto = makeUpdateDto('IN_PROGRESS');

      await service.updateStatus(TENANT_ID, ORDER_ID, dto, USER_ID);

      expect(eventDispatcher.dispatch).toHaveBeenCalledTimes(1);
      expect(eventDispatcher.dispatch).not.toHaveBeenCalledWith(
        expect.any(OrderCancelledEvent),
      );
    });

    it('passes branchId to findById for scoped access', async () => {
      ordersRepo.findById.mockResolvedValue(makeOrder({ status: 'BOOKED' }));
      ordersRepo.updateStatus.mockResolvedValue(
        makeOrder({ status: 'IN_PROGRESS' }),
      );
      const dto = makeUpdateDto('IN_PROGRESS');

      await service.updateStatus(TENANT_ID, ORDER_ID, dto, USER_ID, BRANCH_ID);

      expect(ordersRepo.findById).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
        BRANCH_ID,
      );
    });

    // --- Valid transitions ---

    describe('VALID_STATUS_TRANSITIONS enforcement', () => {
      const validTransitions: [string, string][] = [
        ['BOOKED', 'IN_PROGRESS'],
        ['BOOKED', 'CANCELLED'],
        ['BOOKED', 'NO_SHOW'],
        ['BOOKED_PENDING_CONFIRMATION', 'BOOKED'],
        ['BOOKED_PENDING_CONFIRMATION', 'CANCELLED'],
        ['IN_PROGRESS', 'COMPLETED'],
        ['IN_PROGRESS', 'CANCELLED'],
      ];

      it.each(validTransitions)(
        'allows transition from %s to %s',
        async (from, to) => {
          ordersRepo.findById.mockResolvedValue(makeOrder({ status: from }));
          ordersRepo.updateStatus.mockResolvedValue(makeOrder({ status: to }));

          await expect(
            service.updateStatus(
              TENANT_ID,
              ORDER_ID,
              makeUpdateDto(to),
              USER_ID,
            ),
          ).resolves.not.toThrow();
        },
      );

      const invalidTransitions: [string, string][] = [
        ['COMPLETED', 'IN_PROGRESS'],
        ['COMPLETED', 'CANCELLED'],
        ['COMPLETED', 'BOOKED'],
        ['CANCELLED', 'BOOKED'],
        ['CANCELLED', 'IN_PROGRESS'],
        ['CANCELLED', 'COMPLETED'],
        ['NO_SHOW', 'BOOKED'],
        ['NO_SHOW', 'IN_PROGRESS'],
        ['NO_SHOW', 'CANCELLED'],
        ['BOOKED', 'COMPLETED'],
        ['BOOKED', 'BOOKED_PENDING_CONFIRMATION'],
        ['IN_PROGRESS', 'BOOKED'],
        ['BOOKED_PENDING_CONFIRMATION', 'IN_PROGRESS'],
        ['BOOKED_PENDING_CONFIRMATION', 'COMPLETED'],
      ];

      it.each(invalidTransitions)(
        'throws BadRequestException for invalid transition from %s to %s',
        async (from, to) => {
          ordersRepo.findById.mockResolvedValue(makeOrder({ status: from }));

          await expect(
            service.updateStatus(
              TENANT_ID,
              ORDER_ID,
              makeUpdateDto(to),
              USER_ID,
            ),
          ).rejects.toThrow(
            new BadRequestException(`Cannot transition from ${from} to ${to}`),
          );
        },
      );

      it('does not call updateStatus repository when transition is invalid', async () => {
        ordersRepo.findById.mockResolvedValue(
          makeOrder({ status: 'COMPLETED' }),
        );

        await expect(
          service.updateStatus(
            TENANT_ID,
            ORDER_ID,
            makeUpdateDto('BOOKED'),
            USER_ID,
          ),
        ).rejects.toThrow(BadRequestException);

        expect(ordersRepo.updateStatus).not.toHaveBeenCalled();
      });
    });

    it('throws NotFoundException when order does not exist', async () => {
      ordersRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          TENANT_ID,
          ORDER_ID,
          makeUpdateDto('IN_PROGRESS'),
          USER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =========================================================================
  // softDelete
  // =========================================================================

  describe('softDelete', () => {
    it('deletes the order when it exists', async () => {
      const order = makeOrder();
      ordersRepo.findById.mockResolvedValue(order);
      ordersRepo.softDelete.mockResolvedValue({
        ...order,
        deletedAt: new Date(),
      });

      const result = await service.softDelete(TENANT_ID, ORDER_ID);

      expect(result).toEqual(expect.objectContaining({ id: ORDER_ID }));
      expect(ordersRepo.softDelete).toHaveBeenCalledWith(TENANT_ID, ORDER_ID);
    });

    it('calls findById guard before deleting', async () => {
      ordersRepo.findById.mockResolvedValue(makeOrder());
      ordersRepo.softDelete.mockResolvedValue({});

      await service.softDelete(TENANT_ID, ORDER_ID);

      expect(ordersRepo.findById).toHaveBeenCalledTimes(1);
      expect(ordersRepo.findById).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
        null,
      );
    });

    it('applies branchId scoping to the findById guard', async () => {
      ordersRepo.findById.mockResolvedValue(makeOrder());
      ordersRepo.softDelete.mockResolvedValue({});

      await service.softDelete(TENANT_ID, ORDER_ID, BRANCH_ID);

      expect(ordersRepo.findById).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
        BRANCH_ID,
      );
    });

    it('throws NotFoundException when order does not exist', async () => {
      ordersRepo.findById.mockResolvedValue(null);

      await expect(service.softDelete(TENANT_ID, ORDER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('does not call softDelete repository when order is not found', async () => {
      ordersRepo.findById.mockResolvedValue(null);

      await expect(service.softDelete(TENANT_ID, ORDER_ID)).rejects.toThrow();

      expect(ordersRepo.softDelete).not.toHaveBeenCalled();
    });

    it('does not apply branchId to the softDelete repository call', async () => {
      ordersRepo.findById.mockResolvedValue(makeOrder());
      ordersRepo.softDelete.mockResolvedValue({});

      await service.softDelete(TENANT_ID, ORDER_ID, BRANCH_ID);

      // softDelete only receives tenantId and id, not branchId
      expect(ordersRepo.softDelete).toHaveBeenCalledWith(TENANT_ID, ORDER_ID);
    });
  });

  // =========================================================================
  // restore
  // =========================================================================

  describe('restore', () => {
    it('restores a soft-deleted order', async () => {
      const deletedOrder = makeOrder({ deletedAt: new Date('2026-01-01') });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      const restored = makeOrder({ deletedAt: null });
      ordersRepo.restore.mockResolvedValue(restored);

      const result = await service.restore(TENANT_ID, ORDER_ID);

      expect(result).toEqual(restored);
      expect(ordersRepo.restore).toHaveBeenCalledWith(TENANT_ID, ORDER_ID);
    });

    it('calls findByIdIncludeDeleted to look up the order', async () => {
      const deletedOrder = makeOrder({ deletedAt: new Date() });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await service.restore(TENANT_ID, ORDER_ID);

      expect(ordersRepo.findByIdIncludeDeleted).toHaveBeenCalledWith(
        TENANT_ID,
        ORDER_ID,
      );
    });

    it('throws NotFoundException when order does not exist at all', async () => {
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(TENANT_ID, ORDER_ID)).rejects.toThrow(
        new NotFoundException('Order not found'),
      );
    });

    it('throws NotFoundException when order belongs to a different branch', async () => {
      const deletedOrder = makeOrder({
        branchId: 'other-branch',
        deletedAt: new Date(),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);

      await expect(
        service.restore(TENANT_ID, ORDER_ID, BRANCH_ID),
      ).rejects.toThrow(new NotFoundException('Order not found'));
    });

    it('does not throw on branch check when branchId is null (tenant-level access)', async () => {
      const deletedOrder = makeOrder({
        branchId: BRANCH_ID,
        deletedAt: new Date(),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await expect(
        service.restore(TENANT_ID, ORDER_ID, null),
      ).resolves.not.toThrow();
    });

    it('does not throw on branch check when branchId matches', async () => {
      const deletedOrder = makeOrder({
        branchId: BRANCH_ID,
        deletedAt: new Date(),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await expect(
        service.restore(TENANT_ID, ORDER_ID, BRANCH_ID),
      ).resolves.not.toThrow();
    });

    it('throws BadRequestException when order exists but is not deleted', async () => {
      const activeOrder = makeOrder({ deletedAt: null });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(activeOrder);

      await expect(service.restore(TENANT_ID, ORDER_ID)).rejects.toThrow(
        new BadRequestException('Order is not deleted'),
      );
    });

    it('does not call restore repository when order is not deleted', async () => {
      const activeOrder = makeOrder({ deletedAt: null });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(activeOrder);

      await expect(service.restore(TENANT_ID, ORDER_ID)).rejects.toThrow();

      expect(ordersRepo.restore).not.toHaveBeenCalled();
    });

    it('does not call restore repository when order is not found', async () => {
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(TENANT_ID, ORDER_ID)).rejects.toThrow();

      expect(ordersRepo.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (not BadRequestException) for branch mismatch before checking deletedAt', async () => {
      // Order is in wrong branch AND is soft-deleted; branch check should surface first
      const deletedOrder = makeOrder({
        branchId: 'wrong-branch',
        deletedAt: new Date(),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);

      await expect(
        service.restore(TENANT_ID, ORDER_ID, BRANCH_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('validates no overlap for non-terminal status orders with scheduled times', async () => {
      const deletedOrder = makeOrder({
        status: 'BOOKED',
        deletedAt: new Date(),
        workPostId: WORK_POST_ID,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await service.restore(TENANT_ID, ORDER_ID);

      expect(schedulingService.validateNoOverlap).toHaveBeenCalledWith(
        TENANT_ID,
        WORK_POST_ID,
        deletedOrder.scheduledStart,
        deletedOrder.scheduledEnd,
        expect.any(Number),
      );
    });

    it('throws ConflictException when the time slot is occupied during restore', async () => {
      const deletedOrder = makeOrder({
        status: 'BOOKED',
        deletedAt: new Date(),
        workPostId: WORK_POST_ID,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      schedulingService.validateNoOverlap.mockResolvedValue(false);

      await expect(service.restore(TENANT_ID, ORDER_ID)).rejects.toThrow(
        new ConflictException(
          'Cannot restore: the time slot is now occupied by another order',
        ),
      );
    });

    it('does not call repo.restore when overlap validation fails', async () => {
      const deletedOrder = makeOrder({
        status: 'BOOKED',
        deletedAt: new Date(),
        workPostId: WORK_POST_ID,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      schedulingService.validateNoOverlap.mockResolvedValue(false);

      await expect(service.restore(TENANT_ID, ORDER_ID)).rejects.toThrow(
        ConflictException,
      );
      expect(ordersRepo.restore).not.toHaveBeenCalled();
    });

    it('skips overlap validation for COMPLETED orders', async () => {
      const deletedOrder = makeOrder({
        status: 'COMPLETED',
        deletedAt: new Date(),
        workPostId: WORK_POST_ID,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await service.restore(TENANT_ID, ORDER_ID);

      expect(schedulingService.validateNoOverlap).not.toHaveBeenCalled();
      expect(ordersRepo.restore).toHaveBeenCalled();
    });

    it('skips overlap validation for CANCELLED orders', async () => {
      const deletedOrder = makeOrder({
        status: 'CANCELLED',
        deletedAt: new Date(),
        workPostId: WORK_POST_ID,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await service.restore(TENANT_ID, ORDER_ID);

      expect(schedulingService.validateNoOverlap).not.toHaveBeenCalled();
    });

    it('skips overlap validation for NO_SHOW orders', async () => {
      const deletedOrder = makeOrder({
        status: 'NO_SHOW',
        deletedAt: new Date(),
        workPostId: WORK_POST_ID,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await service.restore(TENANT_ID, ORDER_ID);

      expect(schedulingService.validateNoOverlap).not.toHaveBeenCalled();
    });

    it('skips overlap validation when workPostId is null', async () => {
      const deletedOrder = makeOrder({
        status: 'BOOKED',
        deletedAt: new Date(),
        workPostId: null,
        scheduledStart: new Date('2026-03-01T10:00:00Z'),
        scheduledEnd: new Date('2026-03-01T11:00:00Z'),
      });
      ordersRepo.findByIdIncludeDeleted.mockResolvedValue(deletedOrder);
      ordersRepo.restore.mockResolvedValue(makeOrder());

      await service.restore(TENANT_ID, ORDER_ID);

      expect(schedulingService.validateNoOverlap).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // create — booking constraints edge cases
  // =========================================================================

  describe('create — booking constraints', () => {
    it('throws BadRequestException when scheduled on a non-working day', async () => {
      // 2026-03-01 is a Sunday (day 0)
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      // Remove Sunday (0) from working days
      prisma.bookingSettings.findFirst.mockResolvedValue({
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
        workingHoursStart: '08:00',
        workingHoursEnd: '20:00',
        workingDays: [1, 2, 3, 4, 5, 6],
        maxAdvanceBookingDays: 365,
        allowOnlineBooking: true,
      });
      const dto = makeCreateDto({
        scheduledStart: '2026-03-01T10:00:00Z',
      });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        new BadRequestException(
          'Booking is not allowed on this day of the week',
        ),
      );
    });

    it('throws BadRequestException when booking too far in advance', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      prisma.bookingSettings.findFirst.mockResolvedValue({
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
        workingHoursStart: '08:00',
        workingHoursEnd: '20:00',
        workingDays: [0, 1, 2, 3, 4, 5, 6],
        maxAdvanceBookingDays: 1,
        allowOnlineBooking: true,
      });
      // Schedule a year from now — way beyond 1-day limit
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 1);
      const dto = makeCreateDto({
        scheduledStart: farFuture.toISOString(),
      });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('does not throw when booking within advance limit on a working day', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(makeOrder());
      // Use tomorrow with all days allowed
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(10, 0, 0, 0);
      const dto = makeCreateDto({
        scheduledStart: tomorrow.toISOString(),
      });

      await expect(
        service.create(TENANT_ID, dto, USER_ID),
      ).resolves.not.toThrow();
    });
  });

  // =========================================================================
  // create — employee auto-assignment
  // =========================================================================

  describe('create — employee auto-assignment', () => {
    it('returns assignedEmployeeId when dto specifies one', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.order.create.mockResolvedValue(
        makeOrder({ assignedEmployeeId: 'emp-1' }),
      );
      const dto = makeCreateDto({ assignedEmployeeId: 'emp-1' });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedEmployeeId: 'emp-1' }),
        }),
      );
      // Should not try to auto-assign
      expect(mockTx.employeeProfile.count).not.toHaveBeenCalled();
    });

    it('sets assignedEmployeeId to undefined when no employee profiles exist', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.employeeProfile.count.mockResolvedValue(0);
      mockTx.order.create.mockResolvedValue(makeOrder());
      const dto = makeCreateDto({ assignedEmployeeId: undefined });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedEmployeeId: undefined }),
        }),
      );
    });

    it('auto-assigns an available employee when profiles exist', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.employeeProfile.count.mockResolvedValue(2);
      mockTx.employeeProfile.findFirst.mockResolvedValue({ id: 'emp-auto' });
      mockTx.order.create.mockResolvedValue(
        makeOrder({ assignedEmployeeId: 'emp-auto' }),
      );
      const dto = makeCreateDto({ assignedEmployeeId: undefined });

      await service.create(TENANT_ID, dto, USER_ID);

      expect(mockTx.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedEmployeeId: 'emp-auto' }),
        }),
      );
    });

    it('throws BadRequestException when profiles exist but none are available', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.employeeProfile.count.mockResolvedValue(3);
      mockTx.employeeProfile.findFirst.mockResolvedValue(null);
      const dto = makeCreateDto({ assignedEmployeeId: undefined });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        new BadRequestException(
          'No available employees for the requested time',
        ),
      );
    });
  });

  // =========================================================================
  // create — resolveWorkPost re-throws non-ConflictException errors
  // =========================================================================

  describe('create — resolveWorkPost error propagation', () => {
    it('re-throws non-ConflictException errors from reserveSlot during auto-assign', async () => {
      const svc = makeService(SERVICE_ID_1, 50, 30);
      servicesRepo.findByIds.mockResolvedValue([svc]);
      mockTx.workPost.findMany.mockResolvedValue([
        {
          id: 'wp-1',
          tenantId: TENANT_ID,
          branchId: BRANCH_ID,
          isActive: true,
        },
      ]);
      const internalError = new Error('Internal DB failure');
      schedulingService.reserveSlot.mockRejectedValue(internalError);
      const dto = makeCreateDto({ workPostId: undefined });

      await expect(service.create(TENANT_ID, dto, USER_ID)).rejects.toThrow(
        internalError,
      );
    });
  });
});
