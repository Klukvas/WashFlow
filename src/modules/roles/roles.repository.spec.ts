import { Test, TestingModule } from '@nestjs/testing';
import { RolesRepository } from './roles.repository';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('RolesRepository', () => {
  let repo: RolesRepository;

  const tenantId = 'tenant-1';
  const roleId = 'role-1';

  const mockRoleRaw = {
    id: roleId,
    name: 'admin',
    permissions: [
      { permission: { id: 'perm-1', module: 'orders', action: 'read' } },
    ],
  };

  const mockRoleFlat = {
    id: roleId,
    name: 'admin',
    permissions: [{ id: 'perm-1', module: 'orders', action: 'read' }],
  };

  const tenantClient = {
    role: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const tenantPrisma = {
    forTenant: jest.fn().mockReturnValue(tenantClient),
  };

  const prisma: Record<string, jest.Mock> = {
    $transaction: jest.fn().mockImplementation(async (fn) => fn(prisma)),
    rolePermission: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    } as any,
    role: {
      findUnique: jest.fn().mockResolvedValue(mockRoleRaw),
    } as any,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantPrisma.forTenant.mockReturnValue(tenantClient);
    tenantClient.role.findMany.mockResolvedValue([mockRoleRaw]);
    tenantClient.role.findFirst.mockResolvedValue(mockRoleRaw);
    tenantClient.role.create.mockResolvedValue(mockRoleRaw);
    tenantClient.role.update.mockResolvedValue(mockRoleRaw);
    (prisma.rolePermission as any).deleteMany.mockResolvedValue({ count: 1 });
    (prisma.rolePermission as any).createMany.mockResolvedValue({ count: 2 });
    (prisma.role as any).findUnique.mockResolvedValue(mockRoleRaw);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesRepository,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    repo = module.get<RolesRepository>(RolesRepository);
  });

  describe('findAll', () => {
    it('returns roles with flattened permissions', async () => {
      const result = await repo.findAll(tenantId);
      expect(tenantClient.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
      expect(result[0].permissions).toEqual(mockRoleFlat.permissions);
    });
  });

  describe('findById', () => {
    it('returns role with flattened permissions when found', async () => {
      const result = await repo.findById(tenantId, roleId);
      expect(tenantClient.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: roleId } }),
      );
      expect(result!.permissions).toEqual(mockRoleFlat.permissions);
    });

    it('returns null when role not found', async () => {
      tenantClient.role.findFirst.mockResolvedValue(null);
      const result = await repo.findById(tenantId, roleId);
      expect(result).toBeNull();
    });
  });

  describe('findByIdIncludeDeleted', () => {
    it('returns role with flattened permissions when found', async () => {
      tenantClient.role.findFirst.mockResolvedValue(mockRoleRaw);
      const result = await repo.findByIdIncludeDeleted(tenantId, roleId);
      expect(tenantClient.role.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: roleId }),
        }),
      );
      expect(result!.permissions).toEqual(mockRoleFlat.permissions);
    });

    it('returns null when role not found', async () => {
      tenantClient.role.findFirst.mockResolvedValue(null);
      const result = await repo.findByIdIncludeDeleted(tenantId, roleId);
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates role and returns it with flattened permissions', async () => {
      const data = { name: 'manager', description: 'Branch manager' };
      const result = await repo.create(tenantId, data);
      expect(tenantClient.role.create).toHaveBeenCalledWith(
        expect.objectContaining({ data }),
      );
      expect(result.permissions).toEqual(mockRoleFlat.permissions);
    });
  });

  describe('update', () => {
    it('updates role and returns it with flattened permissions', async () => {
      const data = { name: 'supervisor' };
      const result = await repo.update(tenantId, roleId, data);
      expect(tenantClient.role.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: roleId }, data }),
      );
      expect(result.permissions).toEqual(mockRoleFlat.permissions);
    });
  });

  describe('softDelete', () => {
    it('sets deletedAt on the role', async () => {
      await repo.softDelete(tenantId, roleId);
      const callArgs = tenantClient.role.update.mock.calls[0][0];
      expect(callArgs.data.deletedAt).toBeInstanceOf(Date);
    });
  });

  describe('restore', () => {
    it('restores the role and returns with flattened permissions', async () => {
      const result = await repo.restore(tenantId, roleId);
      const callArgs = tenantClient.role.update.mock.calls[0][0];
      expect(callArgs.data).toEqual({ deletedAt: null });
      expect(result.permissions).toEqual(mockRoleFlat.permissions);
    });
  });

  describe('assignPermissions', () => {
    it('clears existing permissions then creates new ones', async () => {
      const permissionIds = ['perm-1', 'perm-2'];
      await repo.assignPermissions(roleId, permissionIds);
      expect((prisma.rolePermission as any).deleteMany).toHaveBeenCalledWith({
        where: { roleId },
      });
      expect((prisma.rolePermission as any).createMany).toHaveBeenCalledWith({
        data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
      });
    });

    it('skips createMany when no permissionIds provided', async () => {
      await repo.assignPermissions(roleId, []);
      expect((prisma.rolePermission as any).deleteMany).toHaveBeenCalled();
      expect((prisma.rolePermission as any).createMany).not.toHaveBeenCalled();
    });

    it('returns role with flattened permissions after assignment', async () => {
      const result = await repo.assignPermissions(roleId, ['perm-1']);
      expect((prisma.role as any).findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: roleId } }),
      );
      expect(result!.permissions).toEqual(mockRoleFlat.permissions);
    });
  });
});
