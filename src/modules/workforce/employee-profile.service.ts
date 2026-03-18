import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { WorkforceRepository } from './workforce.repository';
import { CreateEmployeeProfileDto } from './dto/create-employee-profile.dto';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import { EmployeeProfileQueryDto } from './dto/employee-profile-query.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmployeeProfileService {
  constructor(
    private readonly workforceRepo: WorkforceRepository,
    private readonly prisma: PrismaService,
  ) {}

  async findAll(tenantId: string, query: EmployeeProfileQueryDto) {
    const { items, total } = await this.workforceRepo.findProfiles(
      tenantId,
      query,
    );
    return paginatedResponse(items, total, query);
  }

  async findById(tenantId: string, id: string) {
    const profile = await this.workforceRepo.findProfileById(tenantId, id);
    if (!profile) throw new NotFoundException('Employee profile not found');
    return profile;
  }

  async create(tenantId: string, dto: CreateEmployeeProfileDto) {
    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, tenantId },
    });
    if (!user) {
      throw new BadRequestException('User not found in this tenant');
    }

    const branch = await this.prisma.branch.findFirst({
      where: { id: dto.branchId, tenantId },
    });
    if (!branch) {
      throw new BadRequestException('Branch not found in this tenant');
    }

    const existing = await this.workforceRepo.findProfileByUserId(
      tenantId,
      dto.userId,
    );
    if (existing) {
      throw new ConflictException(
        'An employee profile already exists for this user',
      );
    }

    return this.workforceRepo.createProfile(tenantId, {
      userId: dto.userId,
      branchId: dto.branchId,
      isWorker: dto.isWorker,
      efficiencyCoefficient: dto.efficiencyCoefficient,
      workStartTime: dto.workStartTime,
      workEndTime: dto.workEndTime,
    });
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeProfileDto) {
    await this.findById(tenantId, id);

    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, tenantId },
      });
      if (!branch) {
        throw new BadRequestException('Branch not found in this tenant');
      }
    }

    return this.workforceRepo.updateProfile(tenantId, id, { ...dto });
  }

  async deactivate(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.workforceRepo.updateProfile(tenantId, id, { active: false });
  }

  async delete(tenantId: string, id: string) {
    const profile = await this.findById(tenantId, id);
    if (profile.active) {
      throw new BadRequestException(
        'Deactivate the employee profile before deleting',
      );
    }
    return this.workforceRepo.deleteProfile(tenantId, id);
  }
}
