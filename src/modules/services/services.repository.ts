import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';

@Injectable()
export class ServicesRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  private mapService<T extends { price?: any }>(service: T): T {
    if (service && service.price != null) {
      return { ...service, price: Number(service.price) };
    }
    return service;
  }

  async findAll(tenantId: string) {
    const rows = await this.db(tenantId).service.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((s) => this.mapService(s));
  }

  async findActive(tenantId: string) {
    const rows = await this.db(tenantId).service.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((s) => this.mapService(s));
  }

  async findById(tenantId: string, id: string) {
    const row = await this.db(tenantId).service.findFirst({ where: { id } });
    return row ? this.mapService(row) : row;
  }

  async findByIds(tenantId: string, ids: string[]) {
    const rows = await this.db(tenantId).service.findMany({
      where: { id: { in: ids }, isActive: true },
    });
    return rows.map((s) => this.mapService(s));
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    const row = await this.db(tenantId).service.create({
      data: data as Prisma.ServiceUncheckedCreateInput,
    });
    return this.mapService(row);
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    const row = await this.db(tenantId).service.update({
      where: { id } as Prisma.ServiceWhereUniqueInput,
      data: data as Prisma.ServiceUpdateInput,
    });
    return this.mapService(row);
  }

  async softDelete(tenantId: string, id: string) {
    const row = await this.db(tenantId).service.update({
      where: { id } as Prisma.ServiceWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
    return this.mapService(row);
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    const row = await this.db(tenantId).service.findFirst({
      where: { id, _includeDeleted: true } as any,
    });
    return row ? this.mapService(row) : row;
  }

  async restore(tenantId: string, id: string) {
    const row = await this.db(tenantId).service.update({
      where: { id } as Prisma.ServiceWhereUniqueInput,
      data: { deletedAt: null },
    });
    return this.mapService(row);
  }
}
