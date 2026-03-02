import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class ServicesRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findAll(tenantId: string) {
    return this.db(tenantId).service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findActive(tenantId: string) {
    return this.db(tenantId).service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findById(tenantId: string, id: string) {
    return this.db(tenantId).service.findFirst({ where: { id } });
  }

  async findByIds(tenantId: string, ids: string[]) {
    return this.db(tenantId).service.findMany({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).service.create({
      data: data as Prisma.ServiceUncheckedCreateInput,
    });
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    return this.db(tenantId).service.update({
      where: { id } as Prisma.ServiceWhereUniqueInput,
      data: data as Prisma.ServiceUpdateInput,
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).service.update({
      where: { id } as Prisma.ServiceWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    return this.db(tenantId).service.findFirst({
      where: { id, _includeDeleted: true } as any,
    });
  }

  async restore(tenantId: string, id: string) {
    return this.db(tenantId).service.update({
      where: { id } as Prisma.ServiceWhereUniqueInput,
      data: { deletedAt: null },
    });
  }
}
