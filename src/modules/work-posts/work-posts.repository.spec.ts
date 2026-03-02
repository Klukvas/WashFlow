import { Test, TestingModule } from '@nestjs/testing';
import { WorkPostsRepository } from './work-posts.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('WorkPostsRepository', () => {
  let repo: WorkPostsRepository;

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const otherBranchId = 'branch-2';
  const workPostId = 'wp-1';

  const mockWorkPost = {
    id: workPostId,
    branchId,
    name: 'Post A',
    branch: { id: branchId },
  };

  const tenantClient = {
    workPost: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.workPost.findMany.mockResolvedValue([mockWorkPost]);
    tenantClient.workPost.findFirst.mockResolvedValue(mockWorkPost);
    tenantClient.workPost.create.mockResolvedValue(mockWorkPost);
    tenantClient.workPost.update.mockResolvedValue(mockWorkPost);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkPostsRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();

    repo = module.get<WorkPostsRepository>(WorkPostsRepository);
  });

  describe('findByBranch', () => {
    it('uses branchId when userBranchId is null', async () => {
      await repo.findByBranch(tenantId, branchId, null);
      expect(tenantClient.workPost.findMany).toHaveBeenCalledWith({
        where: { branchId },
        orderBy: { name: 'asc' },
      });
    });

    it('uses userBranchId when provided (overrides branchId)', async () => {
      await repo.findByBranch(tenantId, branchId, otherBranchId);
      expect(tenantClient.workPost.findMany).toHaveBeenCalledWith({
        where: { branchId: otherBranchId },
        orderBy: { name: 'asc' },
      });
    });

    it('defaults userBranchId to null', async () => {
      await repo.findByBranch(tenantId, branchId);
      expect(tenantClient.workPost.findMany).toHaveBeenCalledWith({
        where: { branchId },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('findById', () => {
    it('returns work post when found and userBranchId is null', async () => {
      const result = await repo.findById(tenantId, workPostId, null);
      expect(result).toEqual(mockWorkPost);
    });

    it('returns work post when branchId matches userBranchId', async () => {
      const result = await repo.findById(tenantId, workPostId, branchId);
      expect(result).toEqual(mockWorkPost);
    });

    it('returns null when branchId does not match userBranchId', async () => {
      const result = await repo.findById(tenantId, workPostId, otherBranchId);
      expect(result).toBeNull();
    });

    it('returns null when work post not found', async () => {
      tenantClient.workPost.findFirst.mockResolvedValue(null);
      const result = await repo.findById(tenantId, workPostId);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates work post and includes branch relation', async () => {
      const data = { name: 'Post B', branchId };
      await repo.create(tenantId, data);
      expect(tenantClient.workPost.create).toHaveBeenCalledWith({
        data,
        include: { branch: true },
      });
    });
  });

  describe('update', () => {
    it('updates work post by id and includes branch relation', async () => {
      const data = { name: 'Post C' };
      await repo.update(tenantId, workPostId, data);
      expect(tenantClient.workPost.update).toHaveBeenCalledWith({
        where: { id: workPostId },
        data,
        include: { branch: true },
      });
    });
  });
});
