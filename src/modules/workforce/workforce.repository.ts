import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { EmployeeProfileQueryDto } from './dto/employee-profile-query.dto';
import { buildPaginationArgs } from '../../common/utils/pagination.util';

@Injectable()
export class WorkforceRepository {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private db(tenantId: string) {
    return this.tenantPrisma.forTenant(tenantId);
  }

  private readonly profileInclude = {
    user: {
      select: { id: true, firstName: true, lastName: true, email: true },
    },
    branch: { select: { id: true, name: true } },
  };

  // ─── Employee Profiles ────────────────────────────────────────

  async findProfiles(tenantId: string, query: EmployeeProfileQueryDto) {
    const { skip, take, orderBy } = buildPaginationArgs(query);
    const where: Record<string, unknown> = {};

    if (query.branchId) where.branchId = query.branchId;
    if (query.active !== undefined) where.active = query.active;

    const [items, total] = await Promise.all([
      this.db(tenantId).employeeProfile.findMany({
        where,
        skip,
        take,
        orderBy,
        include: this.profileInclude,
      }),
      this.db(tenantId).employeeProfile.count({ where }),
    ]);

    return { items, total };
  }

  async findProfileById(tenantId: string, id: string) {
    return this.db(tenantId).employeeProfile.findFirst({
      where: { id },
      include: this.profileInclude,
    });
  }

  async findProfileByUserId(tenantId: string, userId: string) {
    return this.db(tenantId).employeeProfile.findFirst({
      where: { userId },
      include: this.profileInclude,
    });
  }

  async createProfile(
    tenantId: string,
    data: {
      userId: string;
      branchId: string;
      isWorker?: boolean;
      efficiencyCoefficient?: number;
      workStartTime?: string;
      workEndTime?: string;
    },
  ) {
    return this.db(tenantId).employeeProfile.create({
      data: {
        tenantId,
        userId: data.userId,
        branchId: data.branchId,
        isWorker: data.isWorker ?? true,
        efficiencyCoefficient: data.efficiencyCoefficient ?? 1,
        workStartTime: data.workStartTime ?? null,
        workEndTime: data.workEndTime ?? null,
      },
      include: this.profileInclude,
    });
  }

  async updateProfile(
    tenantId: string,
    id: string,
    data: Prisma.EmployeeProfileUpdateInput,
  ) {
    return this.db(tenantId).employeeProfile.update({
      where: { id },
      data,
      include: this.profileInclude,
    });
  }

  async deleteProfile(tenantId: string, id: string) {
    return this.db(tenantId).employeeProfile.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: this.profileInclude,
    });
  }

  async countProfilesForBranch(
    tenantId: string,
    branchId: string,
  ): Promise<number> {
    return this.db(tenantId).employeeProfile.count({
      where: { branchId, active: true, workStartTime: { not: null } },
    });
  }

  // ─── Availability (used by SchedulingService) ─────────────────

  /**
   * Returns IDs of employees who are:
   * - isWorker=true, active=true
   * - Have workStartTime <= slotStartHH and workEndTime >= slotEndHH
   * - NOT already assigned to an overlapping active order
   */
  async findAvailableEmployeesAtSlot(
    tenantId: string,
    branchId: string,
    slotStart: Date,
    slotEnd: Date,
    bufferMinutes: number = 0,
  ): Promise<string[]> {
    const pad = (n: number) => String(n).padStart(2, '0');
    const slotStartHH = `${pad(slotStart.getUTCHours())}:${pad(slotStart.getUTCMinutes())}`;
    const slotEndHH = `${pad(slotEnd.getUTCHours())}:${pad(slotEnd.getUTCMinutes())}`;

    const bufferedStart = new Date(slotStart.getTime() - bufferMinutes * 60000);
    const bufferedEnd = new Date(slotEnd.getTime() + bufferMinutes * 60000);

    const employees = await this.db(tenantId).employeeProfile.findMany({
      where: {
        branchId,
        isWorker: true,
        active: true,
        workStartTime: { lte: slotStartHH },
        workEndTime: { gte: slotEndHH },
        user: { deletedAt: null },
        branch: { deletedAt: null },
        orders: {
          none: {
            status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
            scheduledStart: { lt: bufferedEnd },
            scheduledEnd: { gt: bufferedStart },
            deletedAt: null,
          },
        },
      },
      select: { id: true },
    });

    return employees.map((e) => e.id);
  }
}
