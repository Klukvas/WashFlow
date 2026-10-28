import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersRepository } from './users.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly limits: SubscriptionLimitsService,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(
    tenantId: string,
    query: PaginationDto,
    branchId: string | null = null,
  ) {
    const { items, total } = await this.usersRepo.findAll(
      tenantId,
      query,
      branchId,
    );
    return paginatedResponse(items, total, query);
  }

  async findById(tenantId: string, id: string, branchId: string | null = null) {
    const user = await this.usersRepo.findById(tenantId, id, branchId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private validateBranchAssignment(
    scope: string | null,
    assignment: string | null,
  ): void {
    if (scope !== null && assignment !== scope) {
      throw new ForbiddenException('Cannot assign users outside your branch');
    }
  }

  private async validateRoleBelongsToTenant(
    tenantId: string,
    roleId: string,
  ): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: { id: roleId, tenantId },
    });
    if (!role) {
      throw new BadRequestException('Role not found in this tenant');
    }
  }

  private async validateBranchBelongsToTenant(
    tenantId: string,
    branchId: string,
  ): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, tenantId },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found in this tenant');
    }
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
    branchId: string | null = null,
  ) {
    const assignedBranchId =
      dto.branchId === undefined ? branchId : dto.branchId;
    this.validateBranchAssignment(branchId, assignedBranchId);
    const scopedDto =
      assignedBranchId === null && dto.branchId === undefined
        ? dto
        : { ...dto, branchId: assignedBranchId };
    if (dto.roleId) {
      await this.validateRoleBelongsToTenant(tenantId, dto.roleId);
    }
    if (scopedDto.branchId) {
      await this.validateBranchBelongsToTenant(tenantId, scopedDto.branchId);
    }

    const passwordHash = await argon2.hash(dto.password);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = scopedDto;

    return this.limits.withResourceLimit(tenantId, 'users', (tx) =>
      this.usersRepo.create(
        tenantId,
        {
          ...rest,
          passwordHash,
        },
        tx,
      ),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateUserDto,
    branchId: string | null = null,
  ) {
    await this.findById(tenantId, id, branchId);
    if (dto.branchId !== undefined)
      this.validateBranchAssignment(branchId, dto.branchId);

    if (dto.roleId) {
      await this.validateRoleBelongsToTenant(tenantId, dto.roleId);
    }
    if (dto.branchId) {
      await this.validateBranchBelongsToTenant(tenantId, dto.branchId);
    }

    const raw = { ...dto } as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    if (raw.password !== undefined) {
      updateData.passwordHash = await argon2.hash(raw.password as string);
    }

    // Copy non-relational fields
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = raw;
    const merged = { ...rest, ...updateData };

    return this.usersRepo.update(tenantId, id, merged, branchId);
  }

  async resetPassword(
    tenantId: string,
    id: string,
    dto: ResetPasswordDto,
    branchId: string | null = null,
  ) {
    await this.findById(tenantId, id, branchId);
    const passwordHash = await argon2.hash(dto.newPassword);
    // Increment tokenVersion to invalidate all existing refresh tokens
    await this.usersRepo.update(
      tenantId,
      id,
      {
        passwordHash,
        tokenVersion: { increment: 1 },
      },
      branchId,
    );
  }

  async softDelete(
    tenantId: string,
    id: string,
    performedById: string,
    branchId: string | null = null,
  ) {
    if (id === performedById) {
      throw new ForbiddenException('You cannot delete your own account');
    }
    await this.findById(tenantId, id, branchId);
    return this.usersRepo.softDelete(tenantId, id, branchId);
  }

  async restore(tenantId: string, id: string, branchId: string | null = null) {
    return this.limits.withResourceLimit(tenantId, 'users', async (tx) => {
      const user = await this.usersRepo.findByIdIncludeDeleted(
        tenantId,
        id,
        tx,
        branchId,
      );
      if (!user) throw new NotFoundException('User not found');
      if (!user.deletedAt) throw new BadRequestException('User is not deleted');
      return this.usersRepo.restore(tenantId, id, tx, branchId);
    });
  }
}
