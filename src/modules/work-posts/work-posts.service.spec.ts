import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkPostsService } from './work-posts.service';
import { WorkPostsRepository } from './work-posts.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

describe('WorkPostsService', () => {
  let service: WorkPostsService;
  let repo: Record<string, jest.Mock>;

  const tenantId = 'tenant-1';
  const branchId = 'branch-1';
  const otherBranchId = 'branch-2';
  const workPostId = 'work-post-1';

  const mockWorkPost = {
    id: workPostId,
    tenantId,
    branchId,
    name: 'Post A',
  };

  const mockDeletedWorkPost = {
    id: workPostId,
    tenantId,
    branchId,
    name: 'Post A',
    deletedAt: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    repo = {
      findAll: jest.fn().mockResolvedValue([mockWorkPost]),
      findById: jest.fn().mockResolvedValue(mockWorkPost),
      findByIdIncludeDeleted: jest.fn().mockResolvedValue(mockDeletedWorkPost),
      create: jest.fn().mockResolvedValue(mockWorkPost),
      update: jest.fn().mockResolvedValue(mockWorkPost),
      softDelete: jest.fn().mockResolvedValue(mockWorkPost),
      restore: jest.fn().mockResolvedValue(mockWorkPost),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkPostsService,
        { provide: WorkPostsRepository, useValue: repo },
        {
          provide: SubscriptionLimitsService,
          useValue: {
            checkLimit: jest.fn().mockResolvedValue(undefined),
            getUsage: jest.fn(),
          },
        },
        {
          provide: TenantPrismaService,
          useValue: {
            forTenant: jest.fn().mockReturnValue({
              workPost: { findFirst: jest.fn().mockResolvedValue(null) },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WorkPostsService>(WorkPostsService);
  });

  describe('findAll', () => {
    it('should return work posts for a branch', async () => {
      const result = await service.findAll(tenantId, branchId);
      expect(result).toEqual([mockWorkPost]);
    });

    it('should pass tenantId and branchId to the repository', async () => {
      await service.findAll(tenantId, branchId);
      expect(repo.findAll).toHaveBeenCalledWith(tenantId, branchId, null);
    });

    it('should pass userBranchId to the repository when provided', async () => {
      await service.findAll(tenantId, branchId, branchId);
      expect(repo.findAll).toHaveBeenCalledWith(tenantId, branchId, branchId);
    });

    it('should default userBranchId to null when not provided', async () => {
      await service.findAll(tenantId, branchId);
      expect(repo.findAll).toHaveBeenCalledWith(tenantId, branchId, null);
    });

    it('should return an empty array when repository returns none', async () => {
      repo.findAll.mockResolvedValue([]);
      const result = await service.findAll(tenantId, branchId);
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should return the work post when found', async () => {
      const result = await service.findById(tenantId, workPostId);
      expect(result).toEqual(mockWorkPost);
    });

    it('should pass tenantId, id, and userBranchId to the repository', async () => {
      await service.findById(tenantId, workPostId, branchId);
      expect(repo.findById).toHaveBeenCalledWith(
        tenantId,
        workPostId,
        branchId,
      );
    });

    it('should default userBranchId to null when not provided', async () => {
      await service.findById(tenantId, workPostId);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, workPostId, null);
    });

    it('should throw NotFoundException when work post is not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(tenantId, workPostId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findById(tenantId, workPostId)).rejects.toThrow(
        'Work post not found',
      );
    });
  });

  describe('create', () => {
    const createDto = { name: 'Post A', branchId };

    it('should create and return a work post when userBranchId is null', async () => {
      const result = await service.create(tenantId, createDto, null);
      expect(repo.create).toHaveBeenCalledWith(tenantId, {
        name: createDto.name,
        branchId: createDto.branchId,
      });
      expect(result).toEqual(mockWorkPost);
    });

    it('should create work post when userBranchId matches dto.branchId', async () => {
      const result = await service.create(tenantId, createDto, branchId);
      expect(repo.create).toHaveBeenCalledWith(tenantId, {
        name: createDto.name,
        branchId: createDto.branchId,
      });
      expect(result).toEqual(mockWorkPost);
    });

    it('should default userBranchId to null and allow creation', async () => {
      await service.create(tenantId, createDto);
      expect(repo.create).toHaveBeenCalledWith(tenantId, {
        name: createDto.name,
        branchId: createDto.branchId,
      });
    });

    it('should throw BadRequestException when userBranchId does not match dto.branchId', async () => {
      await expect(
        service.create(tenantId, createDto, otherBranchId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException with correct message when branch mismatch', async () => {
      await expect(
        service.create(tenantId, createDto, otherBranchId),
      ).rejects.toThrow('Cannot create work posts for a different branch');
    });

    it('should not call repository when branch validation fails', async () => {
      await service
        .create(tenantId, createDto, otherBranchId)
        .catch(() => undefined);
      expect(repo.create).not.toHaveBeenCalled();
    });

    it('should pass only name and branchId to the repository', async () => {
      await service.create(tenantId, { ...createDto, extra: 'field' } as any);
      expect(repo.create).toHaveBeenCalledWith(tenantId, {
        name: createDto.name,
        branchId: createDto.branchId,
      });
    });
  });

  describe('update', () => {
    const updateDto = { name: 'Post B' };

    it('should find then update the work post', async () => {
      const result = await service.update(tenantId, workPostId, updateDto);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, workPostId, null);
      expect(repo.update).toHaveBeenCalledWith(tenantId, workPostId, {
        ...updateDto,
      });
      expect(result).toEqual(mockWorkPost);
    });

    it('should pass userBranchId to findById when provided', async () => {
      await service.update(tenantId, workPostId, updateDto, branchId);
      expect(repo.findById).toHaveBeenCalledWith(
        tenantId,
        workPostId,
        branchId,
      );
    });

    it('should default userBranchId to null in findById', async () => {
      await service.update(tenantId, workPostId, updateDto);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, workPostId, null);
    });

    it('should throw NotFoundException when work post does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update(tenantId, workPostId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should not call repository update when work post is not found', async () => {
      repo.findById.mockResolvedValue(null);
      await service
        .update(tenantId, workPostId, updateDto)
        .catch(() => undefined);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('should spread dto fields into the repository update call', async () => {
      const dto = { name: 'Post C' };
      await service.update(tenantId, workPostId, dto);
      expect(repo.update).toHaveBeenCalledWith(tenantId, workPostId, {
        ...dto,
      });
    });
  });

  describe('softDelete', () => {
    it('should soft-delete the work post when userBranchId is null', async () => {
      const result = await service.softDelete(tenantId, workPostId, null);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, workPostId, null);
      expect(repo.softDelete).toHaveBeenCalledWith(tenantId, workPostId);
      expect(result).toEqual(mockWorkPost);
    });

    it('should soft-delete when userBranchId matches workPost.branchId', async () => {
      const result = await service.softDelete(tenantId, workPostId, branchId);
      expect(result).toEqual(mockWorkPost);
    });

    it('should default userBranchId to null', async () => {
      await service.softDelete(tenantId, workPostId);
      expect(repo.findById).toHaveBeenCalledWith(tenantId, workPostId, null);
    });

    it('should throw ForbiddenException when userBranchId does not match workPost.branchId', async () => {
      await expect(
        service.softDelete(tenantId, workPostId, otherBranchId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw with correct message when branch mismatch', async () => {
      await expect(
        service.softDelete(tenantId, workPostId, otherBranchId),
      ).rejects.toThrow('Cannot delete work posts from a different branch');
    });

    it('should not call softDelete when branch validation fails', async () => {
      await service
        .softDelete(tenantId, workPostId, otherBranchId)
        .catch(() => undefined);
      expect(repo.softDelete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when work post does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.softDelete(tenantId, workPostId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('should restore the work post when userBranchId is null', async () => {
      const result = await service.restore(tenantId, workPostId, null);
      expect(repo.restore).toHaveBeenCalledWith(tenantId, workPostId);
      expect(result).toEqual(mockWorkPost);
    });

    it('should restore when userBranchId matches workPost.branchId', async () => {
      const result = await service.restore(tenantId, workPostId, branchId);
      expect(result).toEqual(mockWorkPost);
    });

    it('should default userBranchId to null', async () => {
      await service.restore(tenantId, workPostId);
      expect(repo.restore).toHaveBeenCalledWith(tenantId, workPostId);
    });

    it('should throw NotFoundException when work post is not found', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);
      await expect(service.restore(tenantId, workPostId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException with correct message', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue(null);
      await expect(service.restore(tenantId, workPostId)).rejects.toThrow(
        'Work post not found',
      );
    });

    it('should throw ForbiddenException when userBranchId does not match', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockDeletedWorkPost,
        branchId,
      });
      await expect(
        service.restore(tenantId, workPostId, otherBranchId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw with correct message when branch mismatch on restore', async () => {
      repo.findByIdIncludeDeleted.mockResolvedValue({
        ...mockDeletedWorkPost,
        branchId,
      });
      await expect(
        service.restore(tenantId, workPostId, otherBranchId),
      ).rejects.toThrow('Cannot restore work posts from a different branch');
    });
  });
});
