import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { WorkPostsRepository } from './work-posts.repository';
import { CreateWorkPostDto } from './dto/create-work-post.dto';
import { UpdateWorkPostDto } from './dto/update-work-post.dto';

@Injectable()
export class WorkPostsService {
  constructor(private readonly workPostsRepo: WorkPostsRepository) {}

  async findByBranch(
    tenantId: string,
    branchId: string,
    userBranchId: string | null = null,
  ) {
    return this.workPostsRepo.findByBranch(tenantId, branchId, userBranchId);
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
}
