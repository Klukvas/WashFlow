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
    return this.limits.withResourceLimit(tenantId, 'branches', (tx) =>
      this.branchesRepo.create(tenantId, { ...dto }, tx),
    );
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateBranchDto,
    userBranchId: string | null = null,
  ) {
    await this.findById(tenantId, id, userBranchId);
    return this.branchesRepo.update(tenantId, id, { ...dto }, userBranchId);
  }

  async softDelete(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    const branch = await this.findById(tenantId, id, userBranchId);
    if (branch.deletedAt !== null) {
      throw new BadRequestException('Branch is already deleted');
    }
    return this.branchesRepo.softDelete(tenantId, id, userBranchId);
  }

  async restore(
    tenantId: string,
    id: string,
    userBranchId: string | null = null,
  ) {
    return this.limits.withResourceLimit(tenantId, 'branches', async (tx) => {
      const branch = await this.branchesRepo.findByIdIncludeDeleted(
        tenantId,
        id,
        tx,
        userBranchId,
      );
      if (!branch) throw new NotFoundException('Branch not found');
      if (!branch.deletedAt)
        throw new BadRequestException('Branch is not deleted');
      return this.branchesRepo.restore(tenantId, id, tx, userBranchId);
    });
  }

  async getBookingSettings(
    tenantId: string,
    branchId: string,
    userBranchId: string | null = null,
  ) {
    await this.findById(tenantId, branchId, userBranchId);
    const settings = await this.branchesRepo.getBookingSettings(
      tenantId,
      branchId,
      userBranchId,
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
    userBranchId: string | null = null,
  ) {
    await this.findById(tenantId, branchId, userBranchId);
    return this.branchesRepo.upsertBookingSettings(
      tenantId,
      branchId,
      {
        ...dto,
      },
      userBranchId,
    );
  }
}
