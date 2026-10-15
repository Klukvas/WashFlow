import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { WorkPostsRepository } from './work-posts.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { CreateWorkPostDto } from './dto/create-work-post.dto';
import { UpdateWorkPostDto } from './dto/update-work-post.dto';

@Injectable()
export class WorkPostsService {
  constructor(
    private readonly workPostsRepo: WorkPostsRepository,
    private readonly limits: SubscriptionLimitsService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  private async ensureUniqueNameInBranch(
    tenantId: string,
    branchId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const db = this.tenantPrisma.forTenant(tenantId);
    const existing = await db.workPost.findFirst({
      where: {
        branchId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'A work post with this name already exists in the branch',
      );
    }
  }

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
    const branch = await this.workPostsRepo.findActiveBranch(
      tenantId,
      dto.branchId,
    );
    if (!branch) {
      throw new BadRequestException('Branch not found or inactive');
    }
    await this.ensureUniqueNameInBranch(tenantId, dto.branchId, dto.name);
    return this.limits.withResourceLimit(tenantId, 'workPosts', (tx) =>
      this.workPostsRepo.create(
        tenantId,
        {
          name: dto.name,
          branchId: dto.branchId,
        },
        tx,
      ),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateWorkPostDto,
    userBranchId: string | null = null,
  ) {
    const workPost = await this.findById(tenantId, id, userBranchId);
    if (dto.name) {
      await this.ensureUniqueNameInBranch(
        tenantId,
        workPost.branchId,
        dto.name,
        id,
      );
    }
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
    return this.limits.withResourceLimit(tenantId, 'workPosts', async (tx) => {
      const workPost = await this.workPostsRepo.findByIdIncludeDeleted(
        tenantId,
        id,
        tx,
      );
      if (!workPost) throw new NotFoundException('Work post not found');
      if (!workPost.deletedAt)
        throw new BadRequestException('Work post is not deleted');
      if (userBranchId !== null && workPost.branchId !== userBranchId) {
        throw new ForbiddenException(
          'Cannot restore work posts from a different branch',
        );
      }
      return this.workPostsRepo.restore(tenantId, id, tx);
    });
  }
}
