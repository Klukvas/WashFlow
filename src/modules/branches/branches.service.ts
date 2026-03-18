import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BranchesRepository } from './branches.repository';
import { SubscriptionLimitsService } from '../subscriptions/subscription-limits.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { UpdateBookingSettingsDto } from './dto/booking-settings.dto';
import { PaginationDto } from '../../common/utils/pagination.dto';
import { paginatedResponse } from '../../common/utils/pagination.util';

@Injectable()
export class BranchesService {
  constructor(
    private readonly branchesRepo: BranchesRepository,
    private readonly limits: SubscriptionLimitsService,
  ) {}

  async findAll(
    tenantId: string,
    query: PaginationDto,
    branchId: string | null = null,
  ) {
    const { items, total } = await this.branchesRepo.findAll(
      tenantId,
      query,
      branchId,
    );
    return paginatedResponse(items, total, query);
  }

  async findById(tenantId: string, id: string, branchId: string | null = null) {
    const branch = await this.branchesRepo.findById(tenantId, id, branchId);
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  async create(tenantId: string, dto: CreateBranchDto) {
    await this.limits.checkLimit(tenantId, 'branches');
    return this.branchesRepo.create(tenantId, { ...dto });
  }

  async update(tenantId: string, id: string, dto: UpdateBranchDto) {
    await this.findById(tenantId, id);
    return this.branchesRepo.update(tenantId, id, { ...dto });
  }

  async softDelete(tenantId: string, id: string) {
    const branch = await this.findById(tenantId, id);
    if (branch.deletedAt !== null) {
      throw new BadRequestException('Branch is already deleted');
    }
    return this.branchesRepo.softDelete(tenantId, id);
  }

  async restore(tenantId: string, id: string) {
    const branch = await this.branchesRepo.findByIdIncludeDeleted(tenantId, id);
    if (!branch) throw new NotFoundException('Branch not found');
    if (!branch.deletedAt)
      throw new BadRequestException('Branch is not deleted');
    await this.limits.checkLimit(tenantId, 'branches');
    return this.branchesRepo.restore(tenantId, id);
  }

  async getBookingSettings(tenantId: string, branchId: string) {
    await this.findById(tenantId, branchId);
    const settings = await this.branchesRepo.getBookingSettings(
      tenantId,
      branchId,
    );
    if (settings === null) {
      return {
        workingDays: [1, 2, 3, 4, 5],
        workStartTime: '09:00',
        workEndTime: '18:00',
        slotDuration: 60,
        maxAdvanceBookingDays: 30,
        requireConfirmation: false,
      };
    }
    return settings;
  }

  async updateBookingSettings(
    tenantId: string,
    branchId: string,
    dto: UpdateBookingSettingsDto,
  ) {
    await this.findById(tenantId, branchId);
    return this.branchesRepo.upsertBookingSettings(tenantId, branchId, {
      ...dto,
    });
  }
}
