import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { WorkPostsRepository } from './work-posts.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';
import { CreateWorkPostDto } from './dto/create-work-post.dto';
import { UpdateWorkPostDto } from './dto/update-work-post.dto';

@Injectable()
export class WorkPostsService {
  constructor(
    private readonly workPostsRepo: WorkPostsRepository,
    private readonly limits: SubscriptionLimitsService,
  ) {}

  async findAll(
    tenantId: string,
    branchId?: string,
    userBranchId: string | null = null,
  ) {
    return this.workPostsRepo.findAll(tenantId, branchId, userBranchId);
  }

  async findById(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    const workPost = await this.workPostsRepo.findById(
      tenantId,
      id,
      userBranchId,
    );
    if (!workPost) throw new NotFoundException('Work post not found');
    return workPost;
  }

  async create(
    tenantId: string,
    dto: CreateWorkPostDto,
    userBranchId: string | null = null,
  ) {
    if (userBranchId !== null && dto.branchId !== userBranchId) {
      throw new BadRequestException(
        'Cannot create work posts for a different branch',
      );
    }
    await this.limits.checkLimit(tenantId, 'workPosts');
    return this.workPostsRepo.create(tenantId, {
      name: dto.name,
      branchId: dto.branchId,
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWorkPostDto,
    userBranchId: string | null = null,
  ) {
    await this.findById(tenantId, id, userBranchId);
    return this.workPostsRepo.update(tenantId, id, { ...dto });
  }

  async softDelete(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    const workPost = await this.findById(tenantId, id, userBranchId);
    if (userBranchId !== null && workPost.branchId !== userBranchId) {
      throw new ForbiddenException(
        'Cannot delete work posts from a different branch',
      );
    }
    return this.workPostsRepo.softDelete(tenantId, id);
  }

  async restore(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    // Find the deleted work post first (before restoring)
    const workPost = await this.workPostsRepo.findByIdIncludeDeleted(
      tenantId,
      id,
    );
    if (!workPost) throw new NotFoundException('Work post not found');
    if (!workPost.deletedAt)
      throw new BadRequestException('Work post is not deleted');
    // Check branch permission before restoring
    if (userBranchId !== null && workPost.branchId !== userBranchId) {
      throw new ForbiddenException(
        'Cannot restore work posts from a different branch',
      );
    }
    // Check subscription limit before restoring
    await this.limits.checkLimit(tenantId, 'workPosts');
    return this.workPostsRepo.restore(tenantId, id);
  }
}
