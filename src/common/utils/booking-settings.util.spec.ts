import { resolveBookingSettings, ResolvedBookingSettings } from './booking-settings.util';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-abc';
const BRANCH_ID = 'branch-xyz';

const HARDCODED_DEFAULTS: ResolvedBookingSettings = {
  slotDurationMinutes: 30,
  bufferTimeMinutes: 10,
  maxAdvanceBookingDays: 30,
  allowOnlineBooking: true,
  workingHoursStart: '08:00',
  workingHoursEnd: '20:00',
  workingDays: [1, 2, 3, 4, 5, 6],
};

function buildSettings(overrides: Partial<ResolvedBookingSettings> = {}): ResolvedBookingSettings {
  return {
    ...HARDCODED_DEFAULTS,
    ...overrides,
  };
}

function buildPrismaMock(overrides: {
  findUnique?: jest.Mock;
  findFirst?: jest.Mock;
} = {}) {
  return {
    bookingSettings: {
      findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
      findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    },
  } as any;
}

// ---------------------------------------------------------------------------
// resolveBookingSettings
// ---------------------------------------------------------------------------

describe('resolveBookingSettings', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Branch-level settings
  // -------------------------------------------------------------------------

  describe('when branchId is provided', () => {
    it('returns branch-level settings when they exist', async () => {
      const branchSettings = buildSettings({ slotDurationMinutes: 60, workingHoursStart: '09:00' });
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(branchSettings),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(result).toEqual(branchSettings);
    });

    it('queries bookingSettings.findUnique with the correct composite key', async () => {
      const branchSettings = buildSettings();
      const findUnique = jest.fn().mockResolvedValue(branchSettings);
      const prisma = buildPrismaMock({ findUnique });

      await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(findUnique).toHaveBeenCalledTimes(1);
      expect(findUnique).toHaveBeenCalledWith({
        where: { tenantId_branchId: { tenantId: TENANT_ID, branchId: BRANCH_ID } },
      });
    });

    it('falls back to tenant-level settings when no branch settings exist', async () => {
      const tenantSettings = buildSettings({ bufferTimeMinutes: 5 });
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(tenantSettings),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(result).toEqual(tenantSettings);
    });

    it('queries bookingSettings.findFirst for the tenant after a branch miss', async () => {
      const tenantSettings = buildSettings();
      const findFirst = jest.fn().mockResolvedValue(tenantSettings);
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst,
      });

      await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(findFirst).toHaveBeenCalledTimes(1);
      expect(findFirst).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, branchId: null },
      });
    });

    it('falls back to hardcoded DEFAULTS when both branch and tenant settings are absent', async () => {
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(result).toEqual(HARDCODED_DEFAULTS);
    });
  });

  // -------------------------------------------------------------------------
  // No branchId supplied (null)
  // -------------------------------------------------------------------------

  describe('when branchId is null', () => {
    it('returns tenant-level settings when they exist', async () => {
      const tenantSettings = buildSettings({ maxAdvanceBookingDays: 60 });
      const prisma = buildPrismaMock({
        findFirst: jest.fn().mockResolvedValue(tenantSettings),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, null);

      expect(result).toEqual(tenantSettings);
    });

    it('does not call findUnique when branchId is null', async () => {
      const findUnique = jest.fn();
      const prisma = buildPrismaMock({
        findUnique,
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await resolveBookingSettings(prisma, TENANT_ID, null);

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('falls back to hardcoded DEFAULTS when tenant settings are absent', async () => {
      const prisma = buildPrismaMock({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, null);

      expect(result).toEqual(HARDCODED_DEFAULTS);
    });
  });

  // -------------------------------------------------------------------------
  // No branchId supplied (undefined)
  // -------------------------------------------------------------------------

  describe('when branchId is undefined', () => {
    it('returns tenant-level settings when they exist', async () => {
      const tenantSettings = buildSettings({ allowOnlineBooking: false });
      const prisma = buildPrismaMock({
        findFirst: jest.fn().mockResolvedValue(tenantSettings),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, undefined);

      expect(result).toEqual(tenantSettings);
    });

    it('does not call findUnique when branchId is undefined', async () => {
      const findUnique = jest.fn();
      const prisma = buildPrismaMock({
        findUnique,
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await resolveBookingSettings(prisma, TENANT_ID, undefined);

      expect(findUnique).not.toHaveBeenCalled();
    });

    it('falls back to hardcoded DEFAULTS when tenant settings are absent', async () => {
      const prisma = buildPrismaMock({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, undefined);

      expect(result).toEqual(HARDCODED_DEFAULTS);
    });

    it('does not call findUnique when branchId is omitted entirely', async () => {
      const findUnique = jest.fn();
      const prisma = buildPrismaMock({
        findUnique,
        findFirst: jest.fn().mockResolvedValue(null),
      });

      await resolveBookingSettings(prisma, TENANT_ID);

      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Tenant-level settings (no branchId supplied at all)
  // -------------------------------------------------------------------------

  describe('when branchId is not supplied', () => {
    it('queries findFirst with branchId: null to target tenant-level settings', async () => {
      const findFirst = jest.fn().mockResolvedValue(null);
      const prisma = buildPrismaMock({ findFirst });

      await resolveBookingSettings(prisma, TENANT_ID);

      expect(findFirst).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, branchId: null },
      });
    });
  });

  // -------------------------------------------------------------------------
  // Immutability of DEFAULTS
  // -------------------------------------------------------------------------

  describe('immutability of the returned DEFAULTS copy', () => {
    it('returns a new object each call — not the same DEFAULTS reference', async () => {
      const prisma = buildPrismaMock({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      const first = await resolveBookingSettings(prisma, TENANT_ID);
      const second = await resolveBookingSettings(prisma, TENANT_ID);

      expect(first).not.toBe(second);
    });

    it('mutating the returned DEFAULTS copy does not affect subsequent calls', async () => {
      const prisma = buildPrismaMock({
        findFirst: jest.fn().mockResolvedValue(null),
      });

      const first = await resolveBookingSettings(prisma, TENANT_ID);
      // Mutate the returned object
      (first as any).slotDurationMinutes = 999;
      (first as any).workingDays = [];

      const second = await resolveBookingSettings(prisma, TENANT_ID);

      expect(second.slotDurationMinutes).toBe(30);
      expect(second.workingDays).toEqual([1, 2, 3, 4, 5, 6]);
    });
  });

  // -------------------------------------------------------------------------
  // Fallback priority order
  // -------------------------------------------------------------------------

  describe('fallback priority: branch → tenant → hardcoded defaults', () => {
    it('prefers branch over tenant when both exist', async () => {
      const branchSettings = buildSettings({ slotDurationMinutes: 15 });
      const tenantSettings = buildSettings({ slotDurationMinutes: 45 });
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(branchSettings),
        findFirst: jest.fn().mockResolvedValue(tenantSettings),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(result.slotDurationMinutes).toBe(15);
    });

    it('does not call findFirst when branch settings are found', async () => {
      const branchSettings = buildSettings();
      const findFirst = jest.fn();
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(branchSettings),
        findFirst,
      });

      await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(findFirst).not.toHaveBeenCalled();
    });

    it('prefers tenant over hardcoded defaults when no branch settings exist', async () => {
      const tenantSettings = buildSettings({ slotDurationMinutes: 45 });
      const prisma = buildPrismaMock({
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(tenantSettings),
      });

      const result = await resolveBookingSettings(prisma, TENANT_ID, BRANCH_ID);

      expect(result.slotDurationMinutes).toBe(45);
    });
  });
});
