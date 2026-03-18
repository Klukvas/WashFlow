import { Injectable } from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { OrderQueryDto } from './dto/order-query.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';
import { applyBranchScope } from '../../common/utils/branch-scope.util';

@Injectable()
export class OrdersRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  private readonly defaultInclude = {
    services: { include: { service: true } },
    client: true,
    vehicle: true,
    branch: true,
    assignedEmployee: {
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    },
    workPost: true,
    createdBy: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
  };

  async findAll(
    tenantId: string,
    query: OrderQueryDto,
    branchId: string | null = null,
  ) {
    const { skip, take, orderBy } = buildPaginationArgs(query);

    let where: Prisma.OrderWhereInput & { _includeDeleted?: boolean } = {};
    if (query.includeDeleted) {
      where._includeDeleted = true;
    }
    if (query.status) where.status = query.status;
    if (query.clientId) where.clientId = query.clientId;
    if (query.dateFrom || query.dateTo) {
      where.scheduledStart = {};
      if (query.dateFrom) where.scheduledStart.gte = new Date(query.dateFrom);
      if (query.dateTo) where.scheduledStart.lte = new Date(query.dateTo);
    }

    // JWT branchId takes precedence (server-enforced); otherwise use query param
    if (branchId !== null) {
      where = applyBranchScope(where, branchId);
    } else if (query.branchId) {
      where.branchId = query.branchId;
    }

    const [items, total] = await Promise.all([
      this.db(tenantId).order.findMany({
        where,
        skip,
        take,
        orderBy,
        include: this.defaultInclude,
      }),
      this.db(tenantId).order.count({ where }),
    ]);

    return { items, total };
  }

  async findById(tenantId: string, id: string, branchId: string | null = null) {
    const where = applyBranchScope({ id } as Prisma.OrderWhereInput, branchId);
    return this.db(tenantId).order.findFirst({
      where,
      include: this.defaultInclude,
    });
  }

  async updateStatus(
    tenantId: string,
    id: string,
    status: OrderStatus,
    cancellationReason?: string,
  ) {
    const data: Prisma.OrderUpdateInput = { status };
    if (cancellationReason) data.cancellationReason = cancellationReason;

    return this.db(tenantId).order.update({
      where: { id } as Prisma.OrderWhereUniqueInput,
      data,
      include: this.defaultInclude,
    });
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).order.update({
      where: { id } as Prisma.OrderWhereUniqueInput,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    return this.db(tenantId).order.findFirst({
      where: { id, _includeDeleted: true } as Prisma.OrderWhereInput,
      include: this.defaultInclude,
    });
  }

  async restore(tenantId: string, id: string) {
    return this.db(tenantId).order.update({
      where: { id } as Prisma.OrderWhereUniqueInput,
      data: { deletedAt: null },
      include: this.defaultInclude,
    });
  }
}
