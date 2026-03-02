import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';
import { applyBranchScope } from '../../common/utils/branch-scope.util';

@Injectable()
export class UsersRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findAll(
    tenantId: string,
    query: PaginationDto,
    userBranchId: string | null = null,
  ) {
    const prisma = this.db(tenantId);
    const { skip, take, orderBy } = buildPaginationArgs(query);
    const base: any = {};
    if (query.includeDeleted) base._includeDeleted = true;
    const where = applyBranchScope(base, userBranchId);

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { role: true, branch: true },
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  async findById(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    const user = await this.db(tenantId).user.findFirst({
      where: { id },
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } },
          },
        },
        branch: true,
      },
    });
    if (user && userBranchId !== null && user.branchId !== userBranchId) {
      return null;
    }
    return user;
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).user.create({
      data: data as Prisma.UserUncheckedCreateInput,
      include: { role: true, branch: true },
    });
  }

  async update(tenantId: string, id: string, data: Prisma.UserUpdateInput) {
    return this.db(tenantId).user.update({
      where: { id } as Prisma.UserWhereUniqueInput,
      data,
      include: { role: true, branch: true },
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).user.update({
      where: { id } as Prisma.UserWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    return this.db(tenantId).user.findFirst({
      where: { id, _includeDeleted: true } as any,
      include: { role: true, branch: true },
    });
  }

  async restore(tenantId: string, id: string) {
    return this.db(tenantId).user.update({
      where: { id } as Prisma.UserWhereUniqueInput,
      data: { deletedAt: null },
      include: { role: true, branch: true },
    });
  }
}
