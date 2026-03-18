import { Test, TestingModule } from '@nestjs/testing';
import { BranchesRepository } from './branches.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto } from '../../common/utils/pagination.dto';

describe('BranchesRepository', () => {
  let repo: BranchesRepository;

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const otherBranchId = 'branch-2';
  const mockBranch = { id: branchId, name: 'Main', workPosts: [] };
  const mockSettings = { tenantId, branchId, slotDurationMinutes: 30 };

  const tenantClient = {
    branch: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  const prisma: Record<string, jest.Mock> = {
    bookingSettings: {
      findUnique: jest.fn().mockResolvedValue(mockSettings),
      upsert: jest.fn().mockResolvedValue(mockSettings),
    } as any,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.branch.findMany.mockResolvedValue([mockBranch]);
    tenantClient.branch.findFirst.mockResolvedValue(mockBranch);
    tenantClient.branch.create.mockResolvedValue(mockBranch);
    tenantClient.branch.update.mockResolvedValue(mockBranch);
    tenantClient.branch.count.mockResolvedValue(1);
    (prisma.bookingSettings as any).findUnique.mockResolvedValue(mockSettings);
    (prisma.bookingSettings as any).upsert.mockResolvedValue(mockSettings);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<BranchesRepository>(BranchesRepository);
  });

  describe('findAll', () => {
    it('returns paginated branches without branchId scope', async () => {
      const query: PaginationDto = { page: 1, limit: 10, sortOrder: 'asc' };
      const result = await repo.findAll(tenantId, query, null);
      expect(tenantClient.branch.findMany).toHaveBeenCalled();
      expect(result).toEqual({ items: [mockBranch], total: 1 });
    });

    it('applies id scope when userBranchId is provided', async () => {
      const query: PaginationDto = { page: 1, limit: 10, sortOrder: 'asc' };
      await repo.findAll(tenantId, query, branchId);
      const callArgs = tenantClient.branch.findMany.mock.calls[0][0];
      expect(callArgs.where.id).toBe(branchId);
    });
  });

  describe('findActive', () => {
    it('returns active branches', async () => {
      await repo.findActive(tenantId, null);
      expect(tenantClient.branch.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });
  });

  describe('findById', () => {
    it('returns branch when found with no branchId restriction', async () => {
      const result = await repo.findById(tenantId, branchId, null);
      expect(result).toEqual(mockBranch);
    });

    it('returns branch when id matches userBranchId', async () => {
      const result = await repo.findById(tenantId, branchId, branchId);
      expect(result).toEqual(mockBranch);
    });

    it('returns null when id does not match userBranchId', async () => {
      const result = await repo.findById(tenantId, branchId, otherBranchId);
      expect(result).toBeNull();
      expect(tenantClient.branch.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('findByIdIncludeDeleted', () => {
    it('returns branch including deleted ones', async () => {
      tenantClient.branch.findFirst.mockResolvedValue(mockBranch);
      const result = await repo.findByIdIncludeDeleted(tenantId, branchId);
      expect(tenantClient.branch.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: branchId }),
          include: { workPosts: true },
        }),
      );
      expect(result).toEqual(mockBranch);
    });

    it('returns null when branch not found', async () => {
      tenantClient.branch.findFirst.mockResolvedValue(null);
      const result = await repo.findByIdIncludeDeleted(tenantId, branchId);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates a branch', async () => {
      const data = { name: 'Downtown' };
      await repo.create(tenantId, data);
      expect(tenantClient.branch.create).toHaveBeenCalledWith({ data });
    });
  });

  describe('update', () => {
    it('updates a branch by id', async () => {
      const data = { name: 'Uptown' };
      await repo.update(tenantId, branchId, data);
      expect(tenantClient.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data,
      });
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the branch', async () => {
      await repo.softDelete(tenantId, branchId);
      const callArgs = tenantClient.branch.update.mock.calls[0][0];
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('clears deletedAt and includes workPosts', async () => {
      await repo.restore(tenantId, branchId);
      expect(tenantClient.branch.update).toHaveBeenCalledWith({
        where: { id: branchId },
        data: { deletedAt: null },
        include: { workPosts: true },
      });
    });
  });

  describe('getBookingSettings', () => {
    it('finds booking settings by tenantId and branchId', async () => {
      const result = await repo.getBookingSettings(tenantId, branchId);
      expect((prisma.bookingSettings as any).findUnique).toHaveBeenCalledWith({
        where: { tenantId_branchId: { tenantId, branchId } },
      });
      expect(result).toEqual(mockSettings);
    });
  });

  describe('upsertBookingSettings', () => {
    it('upserts booking settings for a branch', async () => {
      const data = { slotDurationMinutes: 60 };
      const result = await repo.upsertBookingSettings(tenantId, branchId, data);
      expect((prisma.bookingSettings as any).upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_branchId: { tenantId, branchId } },
          update: data,
        }),
      );
      expect(result).toEqual(mockSettings);
    });
  });
});
