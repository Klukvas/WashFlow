import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class WorkPostsRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findAll(
    tenantId: string,
    branchId?: string,
    userBranchId: string | null = null,
  ) {
    const effectiveBranchId = userBranchId !== null ? userBranchId : branchId;
    return this.db(tenantId).workPost.findMany({
      where: effectiveBranchId ? { branchId: effectiveBranchId } : {},
      include: { branch: { select: { id: true, name: true } } },
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

  async findActiveBranch(tenantId: string, branchId: string) {
    return this.db(tenantId).branch.findFirst({
      where: { id: branchId, isActive: true },
      select: { id: true },
    });
  }

  async create(
    tenantId: string,
    data: Record<string, unknown>,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.db(tenantId)).workPost.create({
      data: (tx
        ? { ...data, tenantId }
        : data) as Prisma.WorkPostUncheckedCreateInput,
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

  async findByIdIncludeDeleted(
    tenantId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ) {
    return (tx ?? this.db(tenantId)).workPost.findFirst({
      where: (tx
        ? { id, tenantId }
        : { id, _includeDeleted: true }) as Prisma.WorkPostWhereInput,
      include: { branch: true },
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).workPost.update({
      where: { id } as Prisma.WorkPostWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async restore(tenantId: string, id: string, tx?: Prisma.TransactionClient) {
    return (tx ?? this.db(tenantId)).workPost.update({
      where: tx ? { id, tenantId, deletedAt: { not: null } } : { id },
      data: { deletedAt: null },
      include: { branch: true },
    });
  }
}
