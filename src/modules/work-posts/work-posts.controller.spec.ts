import { Test, TestingModule } from '@nestjs/testing';
import { WorkPostsController } from './work-posts.controller';
import { WorkPostsService } from './work-posts.service';

describe('WorkPostsController', () => {
  let controller: WorkPostsController;
  let service: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const postId = 'post-1';

  beforeEach(async () => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkPostsController,
        { provide: WorkPostsService, useValue: service },
      ],
    }).compile();

    controller = module.get<WorkPostsController>(WorkPostsController);
  });

  describe('findAll', () => {
    it('should delegate to service with tenantId, branchId, userBranchId', async () => {
      await controller.findAll(tenantId, branchId, branchId);
      expect(service.findAll).toHaveBeenCalledWith(
        tenantId,
        branchId,
        branchId,
      );
    });

    it('should pass null userBranchId', async () => {
      await controller.findAll(tenantId, null, branchId);
      expect(service.findAll).toHaveBeenCalledWith(
        tenantId,
        branchId,
        null,
      );
    });
  });

  describe('findOne', () => {
    it('should delegate to service with tenantId, id, userBranchId', async () => {
      await controller.findOne(tenantId, branchId, postId);
      expect(service.findById).toHaveBeenCalledWith(tenantId, postId, branchId);
    });

    it('should pass null userBranchId', async () => {
      await controller.findOne(tenantId, null, postId);
      expect(service.findById).toHaveBeenCalledWith(tenantId, postId, null);
    });
  });

  describe('create', () => {
    it('should delegate to service with tenantId, dto, userBranchId', async () => {
      const dto = { name: 'Post A', branchId } as any;
      await controller.create(tenantId, branchId, dto);
      expect(service.create).toHaveBeenCalledWith(tenantId, dto, branchId);
    });
  });

  describe('update', () => {
    it('should delegate to service with tenantId, id, dto, userBranchId', async () => {
      const dto = { name: 'Post B' } as any;
      await controller.update(tenantId, branchId, postId, dto);
      expect(service.update).toHaveBeenCalledWith(
        tenantId,
        postId,
        dto,
        branchId,
      );
    });
  });
});
