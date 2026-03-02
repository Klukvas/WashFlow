import { Test, TestingModule } from '@nestjs/testing';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderQueryDto } from './dto/order-query.dto';
import type { JwtPayload } from '../../common/types/jwt-payload.type';

const mockOrdersService = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  updateStatus: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
};

const mockSchedulingService = {
  checkAvailability: jest.fn(),
};

describe('OrdersController', () => {
  let controller: OrdersController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrdersController],
      providers: [
        { provide: OrdersService, useValue: mockOrdersService },
        { provide: SchedulingService, useValue: mockSchedulingService },
      ],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(
        require('../../common/guards/permissions.guard').PermissionsGuard,
      )
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrdersController>(OrdersController);
  });

  describe('findAll', () => {
    it('delegates to ordersService.findAll with tenantId, query and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const query: OrderQueryDto = {} as OrderQueryDto;
      const expected = [{ id: 'order-1' }];

      mockOrdersService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(tenantId, branchId, query);

      expect(mockOrdersService.findAll).toHaveBeenCalledWith(
        tenantId,
        query,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('checkAvailability', () => {
    it('delegates with default durationMinutes=30 when not provided', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const date = '2026-03-01';
      const expected = [{ slot: '10:00' }];

      mockSchedulingService.checkAvailability.mockResolvedValue(expected);

      const result = await controller.checkAvailability(
        tenantId,
        branchId,
        date,
        undefined,
        undefined,
      );

      expect(mockSchedulingService.checkAvailability).toHaveBeenCalledWith({
        tenantId,
        branchId,
        workPostId: undefined,
        date: new Date(date),
        durationMinutes: 30,
      });
      expect(result).toBe(expected);
    });

    it('delegates with explicit durationMinutes and workPostId when provided', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const date = '2026-03-01';
      const durationMinutes = '60';
      const workPostId = 'post-uuid';
      const expected = [{ slot: '11:00' }];

      mockSchedulingService.checkAvailability.mockResolvedValue(expected);

      const result = await controller.checkAvailability(
        tenantId,
        branchId,
        date,
        durationMinutes,
        workPostId,
      );

      expect(mockSchedulingService.checkAvailability).toHaveBeenCalledWith({
        tenantId,
        branchId,
        workPostId,
        date: new Date(date),
        durationMinutes: 60,
      });
      expect(result).toBe(expected);
    });
  });

  describe('findOne', () => {
    it('delegates to ordersService.findById with tenantId, id and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const id = 'order-uuid';
      const expected = { id };

      mockOrdersService.findById.mockResolvedValue(expected);

      const result = await controller.findOne(tenantId, branchId, id);

      expect(mockOrdersService.findById).toHaveBeenCalledWith(
        tenantId,
        id,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('create', () => {
    it('delegates to ordersService.create with tenantId, dto, userId, idempotencyKey and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const dto: CreateOrderDto = { services: [] } as unknown as CreateOrderDto;
      const user: JwtPayload = { sub: 'user-uuid' } as JwtPayload;
      const idempotencyKey = 'idem-key-123';
      const expected = { id: 'new-order-uuid' };

      mockOrdersService.create.mockResolvedValue(expected);

      const result = await controller.create(
        tenantId,
        branchId,
        dto,
        user,
        idempotencyKey,
      );

      expect(mockOrdersService.create).toHaveBeenCalledWith(
        tenantId,
        dto,
        user.sub,
        idempotencyKey,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('updateStatus', () => {
    it('delegates to ordersService.updateStatus with tenantId, id, dto, userId and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const id = 'order-uuid';
      const dto: UpdateOrderStatusDto = {
        status: 'COMPLETED',
      } as unknown as UpdateOrderStatusDto;
      const user: JwtPayload = { sub: 'user-uuid' } as JwtPayload;
      const expected = { id, status: 'COMPLETED' };

      mockOrdersService.updateStatus.mockResolvedValue(expected);

      const result = await controller.updateStatus(
        tenantId,
        branchId,
        id,
        dto,
        user,
      );

      expect(mockOrdersService.updateStatus).toHaveBeenCalledWith(
        tenantId,
        id,
        dto,
        user.sub,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('remove', () => {
    it('delegates to ordersService.softDelete with tenantId, id and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const id = 'order-uuid';
      const expected = { deleted: true };

      mockOrdersService.softDelete.mockResolvedValue(expected);

      const result = await controller.remove(tenantId, branchId, id);

      expect(mockOrdersService.softDelete).toHaveBeenCalledWith(
        tenantId,
        id,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });

  describe('restore', () => {
    it('delegates to ordersService.restore with tenantId, id and branchId', async () => {
      const tenantId = 'tenant-uuid';
      const branchId = 'branch-uuid';
      const id = 'order-uuid';
      const expected = { id, deletedAt: null };

      mockOrdersService.restore.mockResolvedValue(expected);

      const result = await controller.restore(tenantId, branchId, id);

      expect(mockOrdersService.restore).toHaveBeenCalledWith(
        tenantId,
        id,
        branchId,
      );
      expect(result).toBe(expected);
    });
  });
});
