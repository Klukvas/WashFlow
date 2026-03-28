import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { ClientQueryDto } from './dto/client-query.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';

type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class ClientsRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async findAll(tenantId: string, query: ClientQueryDto) {
    const { skip, take, orderBy } = buildPaginationArgs(query);

    const where: Prisma.ClientWhereInput & { _includeDeleted?: boolean } = {};
    if (query.includeDeleted) {
      where._includeDeleted = true;
    }
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.db(tenantId).client.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { vehicles: true },
      }),
      this.db(tenantId).client.count({ where }),
    ]);

    return { items, total };
  }

  async findById(tenantId: string, id: string) {
    const db = this.db(tenantId);
    const [client, totalOrders] = await Promise.all([
      db.client.findFirst({
        where: { id },
        include: {
          vehicles: true,
          // Limit to the 10 most recent orders for the detail view
          orders: { take: 10, orderBy: { createdAt: 'desc' } },
        },
      }),
      db.order.count({ where: { clientId: id, deletedAt: null } }),
    ]);
    if (!client) return null;
    return { ...client, totalOrders };
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    return this.db(tenantId).client.create({
      data: data as Prisma.ClientUncheckedCreateInput,
      include: { vehicles: true },
    });
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    return this.db(tenantId).client.update({
      where: { id } as Prisma.ClientWhereUniqueInput,
      data: data as Prisma.ClientUpdateInput,
      include: { vehicles: true },
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).client.update({
      where: { id } as Prisma.ClientWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    return this.db(tenantId).client.findFirst({
      where: { id, _includeDeleted: true } as Prisma.ClientWhereInput,
      include: { vehicles: true },
    });
  }

  async restore(tenantId: string, id: string) {
    return this.db(tenantId).client.update({
      where: { id } as Prisma.ClientWhereUniqueInput,
      data: { deletedAt: null },
      include: { vehicles: true },
    });
  }

  async merge(
    tx: TxClient,
    sourceId: string,
    targetId: string,
    fieldOverrides: Record<string, unknown>,
  ) {
    // 1. Get vehicles from both clients (include soft-deleted)
    const [sourceVehicles, targetVehicles] = await Promise.all([
      tx.vehicle.findMany({
        where: {
          clientId: sourceId,
          _includeDeleted: true,
        } as Prisma.VehicleWhereInput,
      }),
      tx.vehicle.findMany({
        where: {
          clientId: targetId,
          _includeDeleted: true,
        } as Prisma.VehicleWhereInput,
      }),
    ]);

    // 2. Handle vehicle deduplication by licensePlate
    const targetPlates = new Map(
      targetVehicles
        .filter((v) => v.licensePlate)
        .map((v) => [v.licensePlate!, v.id]),
    );

    for (const sourceVehicle of sourceVehicles) {
      const duplicateTargetVehicleId = sourceVehicle.licensePlate
        ? targetPlates.get(sourceVehicle.licensePlate)
        : undefined;

      if (duplicateTargetVehicleId) {
        // Re-point orders from source vehicle to target vehicle
        await tx.order.updateMany({
          where: { vehicleId: sourceVehicle.id },
          data: { vehicleId: duplicateTargetVehicleId },
        });
        // Soft-delete the duplicate source vehicle
        await tx.vehicle.update({
          where: { id: sourceVehicle.id } as Prisma.VehicleWhereUniqueInput,
          data: { deletedAt: new Date() },
        });
      } else {
        // Move vehicle to target client
        await tx.vehicle.update({
          where: { id: sourceVehicle.id } as Prisma.VehicleWhereUniqueInput,
          data: { clientId: targetId },
        });
      }
    }

    // 3. Re-point all orders from source to target
    await tx.order.updateMany({
      where: { clientId: sourceId },
      data: { clientId: targetId },
    });

    // 4. Update target client with picked field values
    await tx.client.update({
      where: { id: targetId } as Prisma.ClientWhereUniqueInput,
      data: fieldOverrides as Prisma.ClientUpdateInput,
    });

    // 5. Soft-delete source client
    await tx.client.update({
      where: { id: sourceId } as Prisma.ClientWhereUniqueInput,
      data: { deletedAt: new Date() },
    });

    // 6. Return updated target with vehicles
    return tx.client.findFirst({
      where: { id: targetId },
      include: { vehicles: true },
    });
  }
}
