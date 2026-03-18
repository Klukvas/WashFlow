import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RolesRepository } from './roles.repository';
import { PermissionsRepository } from '../permissions/permissions.repository';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly rolesRepo: RolesRepository,
    private readonly permissionsRepo: PermissionsRepository,
  ) {}

  async findAll(tenantId: string) {
    return this.rolesRepo.findAll(tenantId);
  }

  async findById(tenantId: string, id: string) {
    const role = await this.rolesRepo.findById(tenantId, id);
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  async create(tenantId: string, dto: CreateRoleDto) {
    return this.rolesRepo.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateRoleDto) {
    await this.findById(tenantId, id);
    return this.rolesRepo.update(tenantId, id, dto);
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.rolesRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string) {
    const role = await this.rolesRepo.findByIdIncludeDeleted(tenantId, id);
    if (!role) throw new NotFoundException('Role not found');
    if (!role.deletedAt) throw new BadRequestException('Role is not deleted');
    return this.rolesRepo.restore(tenantId, id);
  }

  async assignPermissions(
    tenantId: string,
    roleId: string,
    permissionIds: string[],
  ) {
    await this.findById(tenantId, roleId);
    if (permissionIds.length > 0) {
      const found = await this.permissionsRepo.findByIds(permissionIds);
      if (found.length !== permissionIds.length) {
        throw new BadRequestException('One or more permission IDs are invalid');
      }
    }
    return this.rolesRepo.assignPermissions(roleId, permissionIds);
  }
}
