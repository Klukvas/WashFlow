import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';

@Injectable()
export class AuditRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  async create(data: {
    tenantId: string;
    entityType: string;
    entityId: string;
    action: AuditAction;
    oldValue?: Record<string, unknown> | null;
    newValue?: Record<string, unknown> | null;
    performedById?: string | null;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.db(data.tenantId).auditLog.create({
      data: data as unknown as Prisma.AuditLogUncheckedCreateInput,
    });
  }

  async findAll(
    tenantId: string,
    query: AuditQueryDto,
    branchId: string | null = null,
  ) {
    const { skip, take } = buildPaginationArgs(query);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;
    if (query.performedById) where.performedById = query.performedById;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.createdAt.lte = new Date(query.dateTo);
    }

    // Branch scoping via metadata.branchId for order-related audit entries
    if (branchId !== null) {
      where.metadata = { path: ['branchId'], equals: branchId };
    }

    const [items, total] = await Promise.all([
      this.db(tenantId).auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          performedBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.db(tenantId).auditLog.count({ where }),
    ]);

    return { items, total };
  }
}
