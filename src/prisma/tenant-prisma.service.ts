import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Models that support soft deletion (have deletedAt column)
const SOFT_DELETE_MODELS = new Set([
  'User',
  'Client',
  'Order',
  'Vehicle',
  'Service',
  'Branch',
  'Role',
  'WorkPost',
  'EmployeeProfile',
]);

// Models that bypass tenantId injection entirely
const BYPASS_TENANT_MODELS = new Set([
  'Permission',
  'RolePermission',
  'IdempotencyKey',
]);

function shouldSoftDeleteFilter(model: string | undefined): boolean {
  return !!model && SOFT_DELETE_MODELS.has(model);
}

function shouldBypassTenant(model: string | undefined): boolean {
  return !!model && BYPASS_TENANT_MODELS.has(model);
}

function stripIncludeDeleted(where: any): {
  cleaned: any;
  includeDeleted: boolean;
} {
  if (!where || typeof where !== 'object')
    return { cleaned: where, includeDeleted: false };
  const { _includeDeleted, ...rest } = where;
  return { cleaned: rest, includeDeleted: !!_includeDeleted };
}

@Injectable()
export class TenantPrismaService {
  constructor(private readonly prisma: PrismaService) {}

  forTenant(tenantId: string) {
    return this.prisma.$extends({
      query: {
        $allModels: {
          async findMany({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            if (shouldSoftDeleteFilter(model)) {
              const { cleaned, includeDeleted } = stripIncludeDeleted(
                args.where,
              );
              args.where = cleaned;
              if (!includeDeleted) {
                args.where = { ...args.where, deletedAt: null };
              }
            }
            return query(args);
          },
          async findFirst({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            if (shouldSoftDeleteFilter(model)) {
              const { cleaned, includeDeleted } = stripIncludeDeleted(
                args.where,
              );
              args.where = cleaned;
              if (!includeDeleted) {
                args.where = { ...args.where, deletedAt: null };
              }
            }
            return query(args);
          },
          async findUnique({ model, args, query }) {
            // Rewrite findUnique → findFirst so we can push tenant + soft-delete
            // filters into SQL rather than fetching and discarding in memory.
            if (!shouldBypassTenant(model) || shouldSoftDeleteFilter(model)) {
              const { _includeDeleted, ...cleanWhere } = (args.where ??
                {}) as any;
              const extraWhere: Record<string, unknown> = { ...cleanWhere };

              if (!shouldBypassTenant(model)) {
                extraWhere['tenantId'] = tenantId;
              }
              if (shouldSoftDeleteFilter(model) && !_includeDeleted) {
                extraWhere['deletedAt'] = null;
              }

              return (query as any)({ ...args, where: extraWhere });
            }
            return query(args);
          },
          async create({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              if (typeof args.data === 'object' && args.data !== null) {
                (args as any).data = { ...args.data, tenantId };
              }
            }
            return query(args);
          },
          async createMany({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              if (Array.isArray(args.data)) {
                (args as any).data = args.data.map((d: any) => ({
                  ...d,
                  tenantId,
                }));
              } else {
                (args as any).data = { ...args.data, tenantId };
              }
            }
            return query(args);
          },
          async update({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId } as typeof args.where;
            }
            return query(args);
          },
          async updateMany({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async delete({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId } as typeof args.where;
            }
            return query(args);
          },
          async deleteMany({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            return query(args);
          },
          async count({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            if (shouldSoftDeleteFilter(model)) {
              const { cleaned, includeDeleted } = stripIncludeDeleted(
                args.where,
              );
              args.where = cleaned;
              if (!includeDeleted) {
                args.where = { ...args.where, deletedAt: null };
              }
            }
            return query(args);
          },
          async aggregate({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            if (shouldSoftDeleteFilter(model)) {
              const { cleaned, includeDeleted } = stripIncludeDeleted(
                args.where,
              );
              args.where = cleaned;
              if (!includeDeleted) {
                args.where = { ...args.where, deletedAt: null };
              }
            }
            return query(args);
          },
          async groupBy({ model, args, query }) {
            if (!shouldBypassTenant(model)) {
              args.where = { ...args.where, tenantId };
            }
            if (shouldSoftDeleteFilter(model)) {
              const { cleaned, includeDeleted } = stripIncludeDeleted(
                args.where,
              );
              args.where = cleaned;
              if (!includeDeleted) {
                args.where = { ...args.where, deletedAt: null };
              }
            }
            return query(args);
          },
        },
        // Models without tenantId — bypass injection entirely
        permission: {
          $allOperations({ args, query }) {
            return query(args);
          },
        },
        rolePermission: {
          $allOperations({ args, query }) {
            return query(args);
          },
        },
        idempotencyKey: {
          $allOperations({ args, query }) {
            return query(args);
          },
        },
      },
    });
  }
}
