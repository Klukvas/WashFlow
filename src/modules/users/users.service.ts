import {
  Injectable,
  NotFoundException,
  BadRequestException,
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

  async create(tenantId: string, dto: CreateUserDto) {
    await this.limits.checkLimit(tenantId, 'users');

    if (dto.roleId) {
      await this.validateRoleBelongsToTenant(tenantId, dto.roleId);
    }
    if (dto.branchId) {
      await this.validateBranchBelongsToTenant(tenantId, dto.branchId);
    }

    const passwordHash = await argon2.hash(dto.password);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...rest } = dto;

    return this.usersRepo.create(tenantId, {
      ...rest,
      passwordHash,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.findById(tenantId, id);

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

    return this.usersRepo.update(tenantId, id, merged);
  }

  async resetPassword(tenantId: string, id: string, dto: ResetPasswordDto) {
    await this.findById(tenantId, id);
    const passwordHash = await argon2.hash(dto.newPassword);
    // Increment tokenVersion to invalidate all existing refresh tokens
    await this.usersRepo.update(tenantId, id, {
      passwordHash,
      tokenVersion: { increment: 1 },
    });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.usersRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string) {
    const user = await this.usersRepo.findByIdIncludeDeleted(tenantId, id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.deletedAt) throw new BadRequestException('User is not deleted');
    await this.limits.checkLimit(tenantId, 'users');
    return this.usersRepo.restore(tenantId, id);
  }
}
