import { Test, TestingModule } from '@nestjs/testing';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';

describe('BranchesController', () => {
  let controller: BranchesController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-uuid-1';
  const branchId = 'branch-uuid-1';
  const itemId = 'item-uuid-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue({ items: [], meta: {} }),
      findById: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      softDelete: jest.fn().mockResolvedValue({}),
      restore: jest.fn().mockResolvedValue({}),
      getBookingSettings: jest.fn().mockResolvedValue({}),
      updateBookingSettings: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesController,
        { provide: BranchesService, useValue: service },
      ],
    }).compile();

    controller = module.get<BranchesController>(BranchesController);
  });

  describe('findAll', () => {
    it('should delegate to service.findAll with tenantId, query, and branchId', async () => {
      const query: PaginationDto = { page: 1, limit: 10, sortOrder: 'asc' };

      await controller.findAll(tenantId, branchId, query);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, query, branchId);
    });

    it('should pass null branchId when no branch context is set', async () => {
      const query: PaginationDto = { page: 1, limit: 10, sortOrder: 'asc' };

      await controller.findAll(tenantId, null, query);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, query, null);
    });
  });

  describe('findOne', () => {
    it('should delegate to service.findById with tenantId, id, and branchId', async () => {
      await controller.findOne(tenantId, branchId, itemId);

      expect(service.findById).toHaveBeenCalledWith(tenantId, itemId, branchId);
    });
  });

  describe('create', () => {
    it('should delegate to service.create with tenantId and dto', async () => {
      const dto: CreateBranchDto = { name: 'Main Branch' } as CreateBranchDto;

      await controller.create(tenantId, dto);

      expect(service.create).toHaveBeenCalledWith(tenantId, dto);
    });
  });

  describe('update', () => {
    it('should delegate to service.update with tenantId, id, and dto', async () => {
      const dto: UpdateBranchDto = {
        name: 'Updated Branch',
      } as UpdateBranchDto;

      await controller.update(tenantId, itemId, dto);

      expect(service.update).toHaveBeenCalledWith(tenantId, itemId, dto);
    });
  });

  describe('remove', () => {
    it('should delegate to service.softDelete with tenantId and id', async () => {
      await controller.remove(tenantId, itemId);

      expect(service.softDelete).toHaveBeenCalledWith(tenantId, itemId);
    });
  });

  describe('restore', () => {
    it('should delegate to service.restore with tenantId and id', async () => {
      await controller.restore(tenantId, itemId);

      expect(service.restore).toHaveBeenCalledWith(tenantId, itemId);
    });
  });

  describe('getBookingSettings', () => {
    it('should delegate to service.getBookingSettings with tenantId and id', async () => {
      await controller.getBookingSettings(tenantId, itemId);

      expect(service.getBookingSettings).toHaveBeenCalledWith(tenantId, itemId);
    });
  });

  describe('updateBookingSettings', () => {
    it('should delegate to service.updateBookingSettings with tenantId, id, and dto', async () => {
      const dto: UpdateBookingSettingsDto = {
        slotDurationMinutes: 30,
      } as UpdateBookingSettingsDto;

      await controller.updateBookingSettings(tenantId, itemId, dto);

      expect(service.updateBookingSettings).toHaveBeenCalledWith(
        tenantId,
        itemId,
        dto,
      );
    });
  });
});
