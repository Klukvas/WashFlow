import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';
import { applyBranchScope } from '../../common/utils/branch-scope.util';

/** Strip passwordHash from user objects before returning to API consumers. */
function stripSensitive<T extends Record<string, unknown>>(
  user: T,
): Omit<T, 'passwordHash'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...safe } = user;
  return safe;
}

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
    const base: Prisma.UserWhereInput & { _includeDeleted?: boolean } =
      query.includeDeleted ? { _includeDeleted: true } : {};
    const where = applyBranchScope(
      base as Record<string, unknown>,
      userBranchId,
    ) as Prisma.UserWhereInput;

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

    return { items: items.map(stripSensitive), total };
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
    return user ? stripSensitive(user) : null;
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    const user = await this.db(tenantId).user.create({
      data: data as Prisma.UserUncheckedCreateInput,
      include: { role: true, branch: true },
    });
    return stripSensitive(user);
  }

  async update(tenantId: string, id: string, data: Prisma.UserUpdateInput) {
    const user = await this.db(tenantId).user.update({
      where: { id } as Prisma.UserWhereUniqueInput,
      data,
      include: { role: true, branch: true },
    });
    return stripSensitive(user);
  }

  async softDelete(tenantId: string, id: string) {
    const user = await this.db(tenantId).user.update({
      where: { id } as Prisma.UserWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    return stripSensitive(user);
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    const user = await this.db(tenantId).user.findFirst({
      where: { id, _includeDeleted: true } as Prisma.UserWhereInput,
      include: { role: true, branch: true },
    });
    return user ? stripSensitive(user) : null;
  }

  async restore(tenantId: string, id: string) {
    const user = await this.db(tenantId).user.update({
      where: { id } as Prisma.UserWhereUniqueInput,
      data: { deletedAt: null },
      include: { role: true, branch: true },
    });
    return stripSensitive(user);
  }
}
