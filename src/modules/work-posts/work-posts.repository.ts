import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class WorkPostsRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findByBranch(
    tenantId: string,
    branchId: string,
    userBranchId: string | null = null,
  ) {
    const effectiveBranchId = userBranchId !== null ? userBranchId : branchId;
    return this.db(tenantId).workPost.findMany({
      where: { branchId: effectiveBranchId },
      orderBy: { name: 'asc' },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    const workPost = await this.db(tenantId).workPost.findFirst({
      where: { id },
      include: { branch: true },
    });
    if (
      workPost &&
      userBranchId !== null &&
      workPost.branchId !== userBranchId
    ) {
      return null;
    }
    return workPost;
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).workPost.create({
      data: data as Prisma.WorkPostUncheckedCreateInput,
      include: { branch: true },
    });
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    return this.db(tenantId).workPost.update({
      where: { id } as Prisma.WorkPostWhereUniqueInput,
      data: data as Prisma.WorkPostUpdateInput,
      include: { branch: true },
    });
  }
}
