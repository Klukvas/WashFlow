export interface TimeSlot {
  start: Date;
  end: Date;
  workPostId: string;
  workPostName: string;
  available: boolean;
}

export interface CheckAvailabilityParams {
  tenantId: string;
  branchId: string;
  workPostId?: string;
  assignedEmployeeId?: string;
  date: Date;
  durationMinutes: number;
}

export interface ReserveSlotParams {
  tenantId: string;
  workPostId: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  bufferMinutes: number;
}
