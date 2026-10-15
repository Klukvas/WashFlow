import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { workingWindowForInterval } from '../../common/utils/working-window.util';

export type EmployeeReservation = {
  tenantId: string;
  branchId: string;
  assignedEmployeeId?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  bufferMinutes: number;
};

/** Shared by explicit and automatic assignment inside the booking transaction. */
export function employeeEligibilityWhere(
  params: EmployeeReservation,
  timezone: string,
): Prisma.EmployeeProfileWhereInput | null {
  const { tenantId, branchId, scheduledStart, scheduledEnd, bufferMinutes } =
    params;
  const window = workingWindowForInterval(
    scheduledStart,
    scheduledEnd,
    timezone,
  );
  if (!window) return null;

  return {
    tenantId,
    branchId,
    isWorker: true,
    active: true,
    deletedAt: null,
    workStartTime: { lte: window.startTime },
    workEndTime: { gte: window.endTime },
    user: { tenantId, isActive: true, deletedAt: null },
    branch: { id: branchId, tenantId, isActive: true, deletedAt: null },
    orders: {
      none: {
        tenantId,
        status: { notIn: ['CANCELLED', 'NO_SHOW', 'COMPLETED'] },
        scheduledStart: {
          lt: new Date(scheduledEnd.getTime() + bufferMinutes * 60000),
        },
        scheduledEnd: {
          gt: new Date(scheduledStart.getTime() - bufferMinutes * 60000),
        },
        deletedAt: null,
      },
    },
  };
}

export async function reserveEmployee(
  tx: Prisma.TransactionClient,
  params: EmployeeReservation,
): Promise<string | undefined> {
  const { tenantId, branchId, assignedEmployeeId } = params;
  if (!assignedEmployeeId) {
    const configured = await tx.employeeProfile.count({
      where: {
        tenantId,
        branchId,
        active: true,
        deletedAt: null,
        workStartTime: { not: null },
      },
    });
    if (configured === 0) return undefined;
  }

  const branch = await tx.branch.findFirst({
    where: { id: branchId, tenantId, isActive: true, deletedAt: null },
    select: { timezone: true },
  });
  const where = branch
    ? employeeEligibilityWhere(params, branch.timezone ?? 'UTC')
    : null;
  const unavailable = () =>
    new BadRequestException(
      assignedEmployeeId
        ? 'Assigned employee is not available for the requested time in this branch'
        : 'No available employees for the requested time',
    );
  if (!where) throw unavailable();

  const candidate = assignedEmployeeId
    ? { id: assignedEmployeeId }
    : await tx.employeeProfile.findFirst({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
      });
  if (!candidate) throw unavailable();

  // Lock a stable row, including when there are no previous employee orders to lock.
  // Serializable predicate reads additionally protect bookings on different work posts.
  await tx.$queryRaw`
    SELECT id FROM employee_profiles
    WHERE id = ${candidate.id} AND "tenantId" = ${tenantId}
      AND "branchId" = ${branchId}
    FOR UPDATE
  `;
  const eligible = await tx.employeeProfile.findFirst({
    where: { ...where, id: candidate.id },
    select: { id: true },
  });
  if (!eligible) throw unavailable();
  return eligible.id;
}
