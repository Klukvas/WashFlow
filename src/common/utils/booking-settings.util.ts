import { PrismaService } from '../../prisma/prisma.service';

export interface ResolvedBookingSettings {
  slotDurationMinutes: number;
  bufferTimeMinutes: number;
  maxAdvanceBookingDays: number;
  allowOnlineBooking: boolean;
  workingHoursStart: string;
  workingHoursEnd: string;
  workingDays: number[];
}

const DEFAULTS: ResolvedBookingSettings = {
  slotDurationMinutes: 30,
  bufferTimeMinutes: 10,
  maxAdvanceBookingDays: 30,
  allowOnlineBooking: true,
  workingHoursStart: '08:00',
  workingHoursEnd: '20:00',
  workingDays: [1, 2, 3, 4, 5, 6],
};

/**
 * Resolve booking settings with fallback chain:
 * 1. Branch-level settings (if branchId provided)
 * 2. Tenant-level defaults (branchId = null)
 * 3. Hardcoded defaults
 */
export async function resolveBookingSettings(
  prisma: PrismaService,
  tenantId: string,
  branchId?: string | null,
): Promise<ResolvedBookingSettings> {
  if (branchId) {
    const branchSettings = await prisma.bookingSettings.findUnique({
      where: { tenantId_branchId: { tenantId, branchId } },
    });
    if (branchSettings) return branchSettings;
  }

  const tenantSettings = await prisma.bookingSettings.findFirst({
    where: { tenantId, branchId: null },
  });
  if (tenantSettings) return tenantSettings;

  return { ...DEFAULTS };
}
