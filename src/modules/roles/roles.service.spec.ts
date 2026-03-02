import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RolesRepository } from './roles.repository';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-abc';
const ROLE_ID = 'role-123';

const buildRole = (overrides: Record<string, unknown> = {}) => ({
  id: ROLE_ID,
  name: 'Admin',
  description: 'Administrator role',
  tenantId: TENANT_ID,
  deletedAt: null,
  permissions: [],
  ...overrides,
});

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------

const buildRepoMock = () => ({
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  findByIdIncludeDeleted: jest.fn(),
  restore: jest.fn(),
  assignPermissions: jest.fn(),
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RolesService', () => {
  let service: RolesService;
  let repoMock: ReturnType<typeof buildRepoMock>;

  beforeEach(async () => {
    repoMock = buildRepoMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: RolesRepository, useValue: repoMock },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Sanity
  // -------------------------------------------------------------------------

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('returns the list of roles for a tenant', async () => {
      const roles = [buildRole(), buildRole({ id: 'role-456', name: 'Staff' })];
      repoMock.findAll.mockResolvedValue(roles);

      const result = await service.findAll(TENANT_ID);

      expect(repoMock.findAll).toHaveBeenCalledTimes(1);
      expect(repoMock.findAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toEqual(roles);
    });

    it('returns an empty array when the tenant has no roles', async () => {
      repoMock.findAll.mockResolvedValue([]);

      const result = await service.findAll(TENANT_ID);

      expect(result).toEqual([]);
    });

    it('propagates repository errors', async () => {
      repoMock.findAll.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.findAll(TENANT_ID)).rejects.toThrow(
        'DB connection lost',
      );
    });
  });

  // -------------------------------------------------------------------------
  // findById
  // -------------------------------------------------------------------------

  describe('findById', () => {
    it('returns the role when it exists', async () => {
      const role = buildRole();
      repoMock.findById.mockResolvedValue(role);

      const result = await service.findById(TENANT_ID, ROLE_ID);

      expect(repoMock.findById).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(result).toEqual(role);
    });

    it('throws NotFoundException when the role does not exist', async () => {
      repoMock.findById.mockResolvedValue(null);

      await expect(service.findById(TENANT_ID, 'unknown-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.findById(TENANT_ID, 'unknown-id')).rejects.toThrow(
        'Role not found',
      );
    });

    it('throws NotFoundException when the repository returns undefined', async () => {
      repoMock.findById.mockResolvedValue(undefined);

      await expect(service.findById(TENANT_ID, ROLE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('delegates creation to the repository and returns the created role', async () => {
      const dto: CreateRoleDto = { name: 'Manager', description: 'Manages things' };
      const created = buildRole({ name: dto.name, description: dto.description });
      repoMock.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, dto);

      expect(repoMock.create).toHaveBeenCalledTimes(1);
      expect(repoMock.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(created);
    });

    it('delegates creation without optional description', async () => {
      const dto: CreateRoleDto = { name: 'Viewer' };
      const created = buildRole({ name: dto.name, description: undefined });
      repoMock.create.mockResolvedValue(created);

      const result = await service.create(TENANT_ID, dto);

      expect(repoMock.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toEqual(created);
    });

    it('propagates repository errors on create', async () => {
      repoMock.create.mockRejectedValue(new Error('Unique constraint failed'));

      await expect(
        service.create(TENANT_ID, { name: 'Duplicate' }),
      ).rejects.toThrow('Unique constraint failed');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    it('finds the role then updates it and returns the result', async () => {
      const existing = buildRole();
      const dto: UpdateRoleDto = { name: 'Super Admin' };
      const updated = buildRole({ name: dto.name });

      repoMock.findById.mockResolvedValue(existing);
      repoMock.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, ROLE_ID, dto);

      expect(repoMock.findById).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(repoMock.update).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, dto);
      expect(result).toEqual(updated);
    });

    it('throws NotFoundException and skips update when the role does not exist', async () => {
      repoMock.findById.mockResolvedValue(null);

      await expect(
        service.update(TENANT_ID, 'ghost-id', { name: 'Ghost' }),
      ).rejects.toThrow(NotFoundException);

      expect(repoMock.update).not.toHaveBeenCalled();
    });

    it('supports partial updates (only description changed)', async () => {
      const existing = buildRole();
      const dto: UpdateRoleDto = { description: 'Updated description' };
      const updated = buildRole({ description: dto.description });

      repoMock.findById.mockResolvedValue(existing);
      repoMock.update.mockResolvedValue(updated);

      const result = await service.update(TENANT_ID, ROLE_ID, dto);

      expect(repoMock.update).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, dto);
      expect(result).toEqual(updated);
    });
  });

  // -------------------------------------------------------------------------
  // softDelete
  // -------------------------------------------------------------------------

  describe('softDelete', () => {
    it('finds the role then soft-deletes it', async () => {
      const existing = buildRole();
      const deleted = buildRole({ deletedAt: new Date('2024-01-01') });

      repoMock.findById.mockResolvedValue(existing);
      repoMock.softDelete.mockResolvedValue(deleted);

      const result = await service.softDelete(TENANT_ID, ROLE_ID);

      expect(repoMock.findById).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(repoMock.softDelete).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(result).toEqual(deleted);
    });

    it('throws NotFoundException and skips delete when the role does not exist', async () => {
      repoMock.findById.mockResolvedValue(null);

      await expect(
        service.softDelete(TENANT_ID, 'ghost-id'),
      ).rejects.toThrow(NotFoundException);

      expect(repoMock.softDelete).not.toHaveBeenCalled();
    });

    it('throws NotFoundException with "Role not found" message', async () => {
      repoMock.findById.mockResolvedValue(null);

      await expect(service.softDelete(TENANT_ID, ROLE_ID)).rejects.toThrow(
        'Role not found',
      );
    });
  });

  // -------------------------------------------------------------------------
  // restore
  // -------------------------------------------------------------------------

  describe('restore', () => {
    it('restores a soft-deleted role and returns the restored role', async () => {
      const deletedRole = buildRole({ deletedAt: new Date('2024-01-01') });
      const restoredRole = buildRole({ deletedAt: null });

      repoMock.findByIdIncludeDeleted.mockResolvedValue(deletedRole);
      repoMock.restore.mockResolvedValue(restoredRole);

      const result = await service.restore(TENANT_ID, ROLE_ID);

      expect(repoMock.findByIdIncludeDeleted).toHaveBeenCalledWith(
        TENANT_ID,
        ROLE_ID,
      );
      expect(repoMock.restore).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(result).toEqual(restoredRole);
    });

    it('throws NotFoundException when the role does not exist (even among deleted)', async () => {
      repoMock.findByIdIncludeDeleted.mockResolvedValue(null);

      await expect(service.restore(TENANT_ID, 'unknown-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.restore(TENANT_ID, 'unknown-id')).rejects.toThrow(
        'Role not found',
      );
      expect(repoMock.restore).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the role exists but is not soft-deleted', async () => {
      const activeRole = buildRole({ deletedAt: null });
      repoMock.findByIdIncludeDeleted.mockResolvedValue(activeRole);

      await expect(service.restore(TENANT_ID, ROLE_ID)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.restore(TENANT_ID, ROLE_ID)).rejects.toThrow(
        'Role is not deleted',
      );
      expect(repoMock.restore).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when repository returns undefined', async () => {
      repoMock.findByIdIncludeDeleted.mockResolvedValue(undefined);

      await expect(service.restore(TENANT_ID, ROLE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // assignPermissions
  // -------------------------------------------------------------------------

  describe('assignPermissions', () => {
    const PERMISSION_IDS = ['perm-1', 'perm-2', 'perm-3'];

    it('validates the role exists then delegates to the repository', async () => {
      const existing = buildRole();
      const roleWithPerms = buildRole({
        permissions: [{ id: 'perm-1' }, { id: 'perm-2' }, { id: 'perm-3' }],
      });

      repoMock.findById.mockResolvedValue(existing);
      repoMock.assignPermissions.mockResolvedValue(roleWithPerms);

      const result = await service.assignPermissions(
        TENANT_ID,
        ROLE_ID,
        PERMISSION_IDS,
      );

      expect(repoMock.findById).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(repoMock.assignPermissions).toHaveBeenCalledWith(
        ROLE_ID,
        PERMISSION_IDS,
      );
      expect(result).toEqual(roleWithPerms);
    });

    it('throws NotFoundException for an unknown role and skips permission assignment', async () => {
      repoMock.findById.mockResolvedValue(null);

      await expect(
        service.assignPermissions(TENANT_ID, 'unknown-role', PERMISSION_IDS),
      ).rejects.toThrow(NotFoundException);

      expect(repoMock.assignPermissions).not.toHaveBeenCalled();
    });

    it('assigns an empty permission list (clearing all permissions)', async () => {
      const existing = buildRole();
      const roleWithNoPerms = buildRole({ permissions: [] });

      repoMock.findById.mockResolvedValue(existing);
      repoMock.assignPermissions.mockResolvedValue(roleWithNoPerms);

      const result = await service.assignPermissions(TENANT_ID, ROLE_ID, []);

      expect(repoMock.assignPermissions).toHaveBeenCalledWith(ROLE_ID, []);
      expect(result).toEqual(roleWithNoPerms);
    });

    it('throws NotFoundException with "Role not found" message for unknown role', async () => {
      repoMock.findById.mockResolvedValue(null);

      await expect(
        service.assignPermissions(TENANT_ID, 'ghost-role', PERMISSION_IDS),
      ).rejects.toThrow('Role not found');
    });

    it('propagates repository errors during permission assignment', async () => {
      const existing = buildRole();
      repoMock.findById.mockResolvedValue(existing);
      repoMock.assignPermissions.mockRejectedValue(
        new Error('Foreign key constraint failed'),
      );

      await expect(
        service.assignPermissions(TENANT_ID, ROLE_ID, ['bad-perm-id']),
      ).rejects.toThrow('Foreign key constraint failed');
    });
  });
});
