import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RolesRepository {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  private static readonly permissionsInclude = {
    permissions: { include: { permission: true } },
  } as const;

  private flattenPermissions<
    T extends { permissions?: { permission: unknown }[] },
  >(role: T) {
    if (!role) return role;
    return {
      ...role,
      permissions: (role.permissions ?? []).map((rp) => rp.permission),
    };
  }

  async findAll(tenantId: string) {
    const roles = await this.db(tenantId).role.findMany({
      include: RolesRepository.permissionsInclude,
      orderBy: { name: 'asc' },
    });
    return roles.map((role) => this.flattenPermissions(role));
  }

  async findById(tenantId: string, id: string) {
    const role = await this.db(tenantId).role.findFirst({
      where: { id },
      include: RolesRepository.permissionsInclude,
    });
    return role ? this.flattenPermissions(role) : null;
  }

  async create(tenantId: string, data: { name: string; description?: string }) {
    const role = await this.db(tenantId).role.create({
      data: data as any,
      include: RolesRepository.permissionsInclude,
    });
    return this.flattenPermissions(role);
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; description?: string },
  ) {
    const role = await this.db(tenantId).role.update({
      where: { id } as any,
      data,
      include: RolesRepository.permissionsInclude,
    });
    return this.flattenPermissions(role);
  }

  async softDelete(tenantId: string, id: string) {
    return this.db(tenantId).role.update({
      where: { id } as any,
      data: { deletedAt: new Date() },
    });
  }

  async findByIdIncludeDeleted(tenantId: string, id: string) {
    const role = await this.db(tenantId).role.findFirst({
      where: { id, _includeDeleted: true } as any,
      include: RolesRepository.permissionsInclude,
    });
    return role ? this.flattenPermissions(role) : null;
  }

  async restore(tenantId: string, id: string) {
    const role = await this.db(tenantId).role.update({
      where: { id } as any,
      data: { deletedAt: null },
      include: RolesRepository.permissionsInclude,
    });
    return this.flattenPermissions(role);
  }

  async assignPermissions(roleId: string, permissionIds: string[]) {
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });

    if (permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({
          roleId,
          permissionId,
        })),
      });
    }

    const role = await this.prisma.role.findUnique({
      where: { id: roleId },
      include: RolesRepository.permissionsInclude,
    });
    return role ? this.flattenPermissions(role) : null;
  }
}
