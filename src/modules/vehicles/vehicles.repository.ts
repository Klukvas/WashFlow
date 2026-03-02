import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { VehicleQueryDto } from './dto/vehicle-query.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';

@Injectable()
export class VehiclesRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findAll(tenantId: string, query: VehicleQueryDto) {
    const { skip, take, orderBy } = buildPaginationArgs(query);

    const where: Prisma.VehicleWhereInput = {};
    if (query.includeDeleted) {
      (where as any)._includeDeleted = true;
    }
    if (query.clientId) where.clientId = query.clientId;
    if (query.search) {
      where.OR = [
        { make: { contains: query.search, mode: 'insensitive' } },
        { model: { contains: query.search, mode: 'insensitive' } },
        { licensePlate: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.db(tenantId).vehicle.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { client: true },
      }),
      this.db(tenantId).vehicle.count({ where }),
    ]);

    return { items, total };
  }

  async findByClientId(tenantId: string, clientId: string) {
    return this.db(tenantId).vehicle.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    return this.db(tenantId).vehicle.findFirst({
      where: { id },
      include: { client: true },
    });
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).vehicle.create({
      data: data as Prisma.VehicleUncheckedCreateInput,
      include: { client: true },
    });
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    return this.db(tenantId).vehicle.update({
      where: { id } as Prisma.VehicleWhereUniqueInput,
      data: data as Prisma.VehicleUpdateInput,
      include: { client: true },
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).vehicle.update({
      where: { id } as Prisma.VehicleWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    return this.db(tenantId).vehicle.findFirst({
      where: { id, _includeDeleted: true } as any,
      include: { client: true },
    });
  }

  async restore(tenantId: string, id: string) {
    return this.db(tenantId).vehicle.update({
      where: { id } as Prisma.VehicleWhereUniqueInput,
      data: { deletedAt: null },
      include: { client: true },
    });
  }
}
