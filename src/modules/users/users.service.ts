import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepo: UsersRepository) {}

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

  async create(tenantId: string, dto: CreateUserDto) {
    const passwordHash = await argon2.hash(dto.password);
    const { password, ...rest } = dto;

    return this.usersRepo.create(tenantId, {
      ...rest,
      passwordHash,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    await this.findById(tenantId, id);

    const raw = { ...dto } as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};

    if (raw.password) {
      updateData.passwordHash = await argon2.hash(raw.password as string);
    }

    // Copy non-relational fields
    const { password, ...rest } = raw;
    Object.assign(updateData, rest);

    return this.usersRepo.update(tenantId, id, updateData);
  }

  async resetPassword(tenantId: string, id: string, dto: ResetPasswordDto) {
    await this.findById(tenantId, id);
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.usersRepo.update(tenantId, id, { passwordHash });
  }

  async softDelete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.usersRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string) {
    const user = await this.usersRepo.findByIdIncludeDeleted(tenantId, id);
    if (!user) throw new NotFoundException('User not found');
    if (!user.deletedAt) throw new BadRequestException('User is not deleted');
    return this.usersRepo.restore(tenantId, id);
  }
}
