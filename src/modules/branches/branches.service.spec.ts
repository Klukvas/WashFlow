import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { BranchesService } from './branches.service';
import { BranchesRepository } from './branches.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';

describe('BranchesService', () => {
  let service: BranchesService;
  let repo: Record<string, jest.Mock>;
  let limits: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const mockBranch = {
    id: branchId,
    tenantId,
    name: 'Main Branch',
    address: '123 Main St',
    phone: '+1234567890',
    isActive: true,
    deletedAt: null,
    workPosts: [],
  };

  beforeEach(async () => {
    repo = {
      findAll: jest.fn().mockResolvedValue({ items: [mockBranch], total: 1 }),
      findById: jest.fn().mockResolvedValue(mockBranch),
      findByIdIncludeDeleted: jest.fn(),
      create: jest.fn().mockResolvedValue(mockBranch),
      update: jest.fn().mockResolvedValue(mockBranch),
      softDelete: jest.fn().mockResolvedValue(mockBranch),
      restore: jest.fn().mockResolvedValue(mockBranch),
    };

    limits = {
      checkLimit: jest.fn().mockResolvedValue(undefined),
      getUsage: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        { provide: BranchesRepository, useValue: repo },
        { provide: SubscriptionLimitsService, useValue: limits },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    const query = { page: 1, limit: 20 };

    it('should return paginated branches with correct shape', async () => {
      const result = await service.findAll(tenantId, query as any);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('page');
      expect(result).toHaveProperty('limit');
      expect(result).toHaveProperty('totalPages');
    });

    it('should pass tenantId, query, and null branchId to repo by default', async () => {
      await service.findAll(tenantId, query as any);

      expect(repo.findAll).toHaveBeenCalledWith(tenantId, query, null);
    });

    it('should pass explicit branchId scope to repo when provided', async () => {
      await service.findAll(tenantId, query as any, branchId);

      expect(repo.findAll).toHaveBeenCalledWith(tenantId, query, branchId);
    });

    it('should return items from repository in paginated response', async () => {
      const result = await service.findAll(tenantId, query as any);

      expect(result.items).toEqual([mockBranch]);
      expect(result.total).toBe(1);
    });

    it('should compute totalPages from total and limit', async () => {
      repo.findAll.mockResolvedValue({ items: [mockBranch], total: 40 });
      const result = await service.findAll(tenantId, {
        page: 1,
        limit: 20,
      } as any);

      expect(result.totalPages).toBe(2);
    });

    it('should return empty items array when repo returns none', async () => {
      repo.findAll.mockResolvedValue({ items: [], total: 0 });
      const result = await service.findAll(tenantId, query as any);

      expect(result.items).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('findById', () => {
    it('should return branch when found without branchId scope', async () => {
      const result = await service.findById(tenantId, branchId);

      expect(result).toEqual(mockBranch);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, branchId, null);
    });

    it('should pass branchId scope to repo when provided', async () => {
      await service.findById(tenantId, branchId, branchId);

      expect(repo.findById).toHaveBeenCalledWith(tenantId, branchId, branchId);
    });

    it('should throw NotFoundException when branch is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findById(tenantId, branchId)).rejects.toThrow(
        'Branch not found',
      );
    });

    it('should throw NotFoundException when branchId scope excludes the requested id', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.findById(tenantId, branchId, 'other-branch'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should call repo.create with tenantId and a spread copy of the dto', async () => {
      const dto = {
        name: 'New Branch',
        address: '456 Oak Ave',
        phone: '+9876543210',
      };
      await service.create(tenantId, dto as any);

      expect(repo.create).toHaveBeenCalledWith(tenantId, { ...dto });
    });

    it('should return the created branch from repo', async () => {
      const dto = { name: 'New Branch' };
      const result = await service.create(tenantId, dto as any);

      expect(result).toEqual(mockBranch);
    });

    it('should spread dto to prevent mutation of original object', async () => {
      const dto = { name: 'New Branch' };
      await service.create(tenantId, dto as any);

      const [, passedData] = repo.create.mock.calls[0];
      expect(passedData).not.toBe(dto);
      expect(passedData).toEqual(dto);
    });

    it('should create with only required name field', async () => {
      const dto = { name: 'Minimal Branch' };
      await service.create(tenantId, dto as any);

      expect(repo.create).toHaveBeenCalledWith(tenantId, {
        name: 'Minimal Branch',
      });
    });

    it('should call checkLimit before creating the branch', async () => {
      const dto = { name: 'New Branch' };
      await service.create(tenantId, dto as any);

      expect(limits.checkLimit).toHaveBeenCalledWith(tenantId, 'branches');
    });

    it('should throw ForbiddenException when subscription limit is reached on create', async () => {
      limits.checkLimit.mockRejectedValue(
        new ForbiddenException('Subscription limit reached'),
      );
      const dto = { name: 'New Branch' };

      await expect(service.create(tenantId, dto as any)).rejects.toThrow(
        ForbiddenException,
      );
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should find the branch then call repo.update with a spread copy of the dto', async () => {
      const dto = { name: 'Updated Branch' };
      await service.update(tenantId, branchId, dto as any);

      expect(repo.findById).toHaveBeenCalledWith(tenantId, branchId, null);
      expect(repo.update).toHaveBeenCalledWith(tenantId, branchId, { ...dto });
    });

    it('should return the updated branch from repo', async () => {
      const dto = { name: 'Updated Branch' };
      const result = await service.update(tenantId, branchId, dto as any);

      expect(result).toEqual(mockBranch);
    });

    it('should spread dto to prevent mutation of original object', async () => {
      const dto = { name: 'Updated Branch' };
      await service.update(tenantId, branchId, dto as any);

      const [, , passedData] = repo.update.mock.calls[0];
      expect(passedData).not.toBe(dto);
      expect(passedData).toEqual(dto);
    });

    it('should throw NotFoundException when branch does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update(tenantId, branchId, {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not call repo.update when branch is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.update(tenantId, branchId, {} as any),
      ).rejects.toThrow(NotFoundException);

      expect(repo.update).not.toHaveBeenCalled();
    });

    it('should update isActive flag independently', async () => {
      const dto = { isActive: false };
      await service.update(tenantId, branchId, dto as any);

      expect(repo.update).toHaveBeenCalledWith(tenantId, branchId, {
        isActive: false,
      });
    });
  });

  describe('softDelete', () => {
    it('should find the branch then call repo.softDelete', async () => {
      await service.softDelete(tenantId, branchId);

      expect(repo.findById).toHaveBeenCalledWith(tenantId, branchId, null);
      expect(repo.softDelete).toHaveBeenCalledWith(tenantId, branchId);
    });

    it('should return the soft-deleted branch from repo', async () => {
      const result = await service.softDelete(tenantId, branchId);

      expect(result).toEqual(mockBranch);
    });

    it('should throw NotFoundException when branch does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.softDelete(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not call repo.softDelete when branch is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.softDelete(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );

      expect(repo.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted branch', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockBranch,
        deletedAt: new Date('2026-01-01'),
      });

      await service.restore(tenantId, branchId);

      expect(repo.findByIdIncludeDeleted).toHaveBeenCalledWith(
        tenantId,
        branchId,
      );
      expect(repo.restore).toHaveBeenCalledWith(tenantId, branchId);
    });

    it('should return the restored branch from repo', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockBranch,
        deletedAt: new Date('2026-01-01'),
      });

      const result = await service.restore(tenantId, branchId);

      expect(result).toEqual(mockBranch);
    });

    it('should throw NotFoundException when branch is not found at all', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        'Branch not found',
      );
    });

    it('should throw BadRequestException when branch exists but is not deleted', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockBranch);

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException with correct message when branch is not deleted', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockBranch);

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        'Branch is not deleted',
      );
    });

    it('should not call repo.restore when branch is not found', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        NotFoundException,
      );

      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('should not call repo.restore when branch is not in deleted state', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(mockBranch);

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        BadRequestException,
      );

      expect(repo.restore).not.toHaveBeenCalled();
    });

    it('should call checkLimit before restoring the branch', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockBranch,
        deletedAt: new Date('2026-01-01'),
      });

      await service.restore(tenantId, branchId);

      expect(limits.checkLimit).toHaveBeenCalledWith(tenantId, 'branches');
    });

    it('should throw ForbiddenException when subscription limit is reached', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockBranch,
        deletedAt: new Date('2026-01-01'),
      });
      limits.checkLimit.mockRejectedValue(
        new ForbiddenException('Subscription limit reached'),
      );

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should not call repo.restore when limit check fails', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockBranch,
        deletedAt: new Date('2026-01-01'),
      });
      limits.checkLimit.mockRejectedValue(
        new ForbiddenException('Subscription limit reached'),
      );

      await expect(service.restore(tenantId, branchId)).rejects.toThrow(
        ForbiddenException,
      );

      expect(repo.restore).not.toHaveBeenCalled();
    });
  });

  describe('getBookingSettings', () => {
    beforeEach(() => {
      repo.getBookingSettings = jest.fn().mockResolvedValue({
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
        workingDays: [1, 2, 3, 4, 5],
      });
    });

    it('should verify the branch exists before fetching settings', async () => {
      await service.getBookingSettings(tenantId, branchId);

      expect(repo.findById).toHaveBeenCalledWith(tenantId, branchId, null);
    });

    it('should return booking settings from repo', async () => {
      const result = await service.getBookingSettings(tenantId, branchId);

      expect(result).toEqual({
        slotDurationMinutes: 30,
        bufferTimeMinutes: 10,
        workingDays: [1, 2, 3, 4, 5],
      });
    });

    it('should call repo.getBookingSettings with tenantId and branchId', async () => {
      await service.getBookingSettings(tenantId, branchId);

      expect(repo.getBookingSettings).toHaveBeenCalledWith(tenantId, branchId);
    });

    it('should throw NotFoundException when branch does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.getBookingSettings(tenantId, branchId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not call repo.getBookingSettings when branch is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.getBookingSettings(tenantId, branchId),
      ).rejects.toThrow(NotFoundException);

      expect(repo.getBookingSettings).not.toHaveBeenCalled();
    });
  });

  describe('updateBookingSettings', () => {
    const dto = {
      slotDurationMinutes: 45,
      bufferTimeMinutes: 15,
      workingDays: [1, 2, 3, 4, 5],
    };

    beforeEach(() => {
      repo.upsertBookingSettings = jest.fn().mockResolvedValue({
        ...dto,
        branchId,
        tenantId,
      });
    });

    it('should verify the branch exists before upserting settings', async () => {
      await service.updateBookingSettings(tenantId, branchId, dto as any);

      expect(repo.findById).toHaveBeenCalledWith(tenantId, branchId, null);
    });

    it('should return the upserted settings from repo', async () => {
      const result = await service.updateBookingSettings(
        tenantId,
        branchId,
        dto as any,
      );

      expect(result).toEqual(
        expect.objectContaining({
          slotDurationMinutes: 45,
          bufferTimeMinutes: 15,
        }),
      );
    });

    it('should call upsertBookingSettings with spread copy of dto', async () => {
      await service.updateBookingSettings(tenantId, branchId, dto as any);

      const [, , passedData] = repo.upsertBookingSettings.mock.calls[0];
      expect(passedData).not.toBe(dto);
      expect(passedData).toEqual(dto);
    });

    it('should throw NotFoundException when branch does not exist', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updateBookingSettings(tenantId, branchId, dto as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not call upsertBookingSettings when branch is not found', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(
        service.updateBookingSettings(tenantId, branchId, dto as any),
      ).rejects.toThrow(NotFoundException);

      expect(repo.upsertBookingSettings).not.toHaveBeenCalled();
    });
  });
});
