import { Test, TestingModule } from '@nestjs/testing';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import type { CreateRoleDto } from './dto/create-role.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';
import type { AssignPermissionsDto } from './dto/assign-permissions.dto';

const TENANT_ID = 'tenant-uuid-1111';
const ROLE_ID   = 'role-uuid-2222';

const mockRolesService = {
  findAll:           jest.fn(),
  findById:          jest.fn(),
  create:            jest.fn(),
  update:            jest.fn(),
  softDelete:        jest.fn(),
  restore:           jest.fn(),
  assignPermissions: jest.fn(),
};

describe('RolesController', () => {
  let controller: RolesController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [
        { provide: RolesService, useValue: mockRolesService },
      ],
    })
      .overrideGuard(require('../../common/guards/jwt-auth.guard').JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(require('../../common/guards/permissions.guard').PermissionsGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<RolesController>(RolesController);
  });

  describe('findAll', () => {
    it('delegates to rolesService.findAll with tenantId', async () => {
      const expected = [{ id: ROLE_ID, name: 'admin' }];
      mockRolesService.findAll.mockResolvedValue(expected);

      const result = await controller.findAll(TENANT_ID);

      expect(mockRolesService.findAll).toHaveBeenCalledTimes(1);
      expect(mockRolesService.findAll).toHaveBeenCalledWith(TENANT_ID);
      expect(result).toBe(expected);
    });
  });

  describe('findOne', () => {
    it('delegates to rolesService.findById with tenantId and id', async () => {
      const expected = { id: ROLE_ID, name: 'admin' };
      mockRolesService.findById.mockResolvedValue(expected);

      const result = await controller.findOne(TENANT_ID, ROLE_ID);

      expect(mockRolesService.findById).toHaveBeenCalledTimes(1);
      expect(mockRolesService.findById).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(result).toBe(expected);
    });
  });

  describe('create', () => {
    it('delegates to rolesService.create with tenantId and dto', async () => {
      const dto: CreateRoleDto = { name: 'manager' } as CreateRoleDto;
      const expected = { id: ROLE_ID, name: 'manager' };
      mockRolesService.create.mockResolvedValue(expected);

      const result = await controller.create(TENANT_ID, dto);

      expect(mockRolesService.create).toHaveBeenCalledTimes(1);
      expect(mockRolesService.create).toHaveBeenCalledWith(TENANT_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('update', () => {
    it('delegates to rolesService.update with tenantId, id and dto', async () => {
      const dto: UpdateRoleDto = { name: 'supervisor' } as UpdateRoleDto;
      const expected = { id: ROLE_ID, name: 'supervisor' };
      mockRolesService.update.mockResolvedValue(expected);

      const result = await controller.update(TENANT_ID, ROLE_ID, dto);

      expect(mockRolesService.update).toHaveBeenCalledTimes(1);
      expect(mockRolesService.update).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, dto);
      expect(result).toBe(expected);
    });
  });

  describe('remove', () => {
    it('delegates to rolesService.softDelete with tenantId and id', async () => {
      const expected = { deleted: true };
      mockRolesService.softDelete.mockResolvedValue(expected);

      const result = await controller.remove(TENANT_ID, ROLE_ID);

      expect(mockRolesService.softDelete).toHaveBeenCalledTimes(1);
      expect(mockRolesService.softDelete).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(result).toBe(expected);
    });
  });

  describe('restore', () => {
    it('delegates to rolesService.restore with tenantId and id', async () => {
      const expected = { id: ROLE_ID };
      mockRolesService.restore.mockResolvedValue(expected);

      const result = await controller.restore(TENANT_ID, ROLE_ID);

      expect(mockRolesService.restore).toHaveBeenCalledTimes(1);
      expect(mockRolesService.restore).toHaveBeenCalledWith(TENANT_ID, ROLE_ID);
      expect(result).toBe(expected);
    });
  });

  describe('assignPermissions', () => {
    it('delegates to rolesService.assignPermissions with tenantId, id and permissionIds', async () => {
      const permissionIds = ['perm-uuid-aaa', 'perm-uuid-bbb'];
      const dto: AssignPermissionsDto = { permissionIds } as AssignPermissionsDto;
      const expected = { id: ROLE_ID, permissions: permissionIds };
      mockRolesService.assignPermissions.mockResolvedValue(expected);

      const result = await controller.assignPermissions(TENANT_ID, ROLE_ID, dto);

      expect(mockRolesService.assignPermissions).toHaveBeenCalledTimes(1);
      expect(mockRolesService.assignPermissions).toHaveBeenCalledWith(TENANT_ID, ROLE_ID, permissionIds);
      expect(result).toBe(expected);
    });
  });
});
