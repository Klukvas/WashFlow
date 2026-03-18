import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';
import { applyBranchScope } from '../../common/utils/branch-scope.util';

@Injectable()
export class BranchesRepository {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findAll(
    tenantId: string,
    query: PaginationDto,
    userBranchId: string | null = null,
  ) {
    const { skip, take, orderBy } = buildPaginationArgs(query);
    const base: Record<string, unknown> = query.includeDeleted
      ? { _includeDeleted: true }
      : {};
    const where = applyBranchScope(base, userBranchId, 'id');
    const [items, total] = await Promise.all([
      this.db(tenantId).branch.findMany({
        where: where as Prisma.BranchWhereInput,
        skip,
        take,
        orderBy,
      }),
      this.db(tenantId).branch.count({
        where: where as Prisma.BranchWhereInput,
      }),
    ]);
    return { items, total };
  }

  async findActive(tenantId: string, userBranchId: string | null = null) {
    const where = applyBranchScope({ isActive: true }, userBranchId, 'id');
    return this.db(tenantId).branch.findMany({
      where: where as Prisma.BranchWhereInput,
      orderBy: { name: 'asc' },
    });
  }

  async findById(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    if (userBranchId !== null && id !== userBranchId) {
      return null;
    }
    return this.db(tenantId).branch.findFirst({
      where: { id },
      include: { workPosts: true },
    });
  }

  async create(
    tenantId: string,
    data: { name: string; address?: string; phone?: string },
  ) {
    return this.db(tenantId).branch.create({
      data: data as Prisma.BranchUncheckedCreateInput,
    });
  }

  async update(tenantId: string, id: string, data: Prisma.BranchUpdateInput) {
    return this.db(tenantId).branch.update({
      where: { id } as Prisma.BranchWhereUniqueInput,
      data,
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).branch.update({
      where: { id } as Prisma.BranchWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    return this.db(tenantId).branch.findFirst({
      where: { id, _includeDeleted: true } as Prisma.BranchWhereInput,
      include: { workPosts: true },
    });
  }

  async restore(tenantId: string, id: string) {
    return this.db(tenantId).branch.update({
      where: { id } as Prisma.BranchWhereUniqueInput,
      data: { deletedAt: null },
      include: { workPosts: true },
    });
  }

  async getBookingSettings(tenantId: string, branchId: string) {
    return this.prisma.bookingSettings.findUnique({
      where: { tenantId_branchId: { tenantId, branchId } },
    });
  }

  async upsertBookingSettings(
    tenantId: string,
    branchId: string,
    data: Record<string, unknown>,
  ) {
    return this.prisma.bookingSettings.upsert({
      where: { tenantId_branchId: { tenantId, branchId } },
      update: data as Prisma.BookingSettingsUpdateInput,
      create: {
        tenantId,
        branchId,
        ...data,
      } as Prisma.BookingSettingsUncheckedCreateInput,
    });
  }
}
